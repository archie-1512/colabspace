# Deploying CollabSpace on AWS

```
GitHub (push to main)
   └─ GitHub Actions ── build Docker image ──► Amazon ECR
                    └─ SSM Run Command ──► EC2 instance
                                            ├─ Caddy (HTTPS, Let's Encrypt)
                                            └─ app container ──► Neon Postgres (pgvector)
                                                   ├─► S3 (uploaded files)
                                                   ├─► SSM Parameter Store (secrets)
                                                   └─► CloudWatch Logs
```

No AWS access keys exist anywhere: the EC2 instance uses an IAM role, and
GitHub Actions assumes a role through OIDC. No SSH port is open: you connect
with Session Manager and deployments run through SSM.

Use **one region for everything**, ideally the one your Neon database is in.
The app talks to the database on every request, so app↔database distance
matters more than user↔app distance. The examples use `ap-southeast-1`
(Singapore). Replace `ACCOUNT_ID`, `REGION`, `BUCKET`, `INSTANCE_ID` and
`YOUR_GITHUB_USER/YOUR_REPO` throughout.

---

## 0. Before you start

- **Rotate any secrets that were ever shared or committed** (Neon password,
  Groq key) and generate a fresh `NEXTAUTH_SECRET`:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- **A domain name** pointing at the server is needed for HTTPS. Any registrar
  works; a free subdomain from duckdns.org also works.
- **Billing alarm first:** Billing and Cost Management → Budgets → Create
  budget → Monthly cost budget, e.g. $5, with an email alert. Do this before
  creating anything else.

## 1. S3 bucket for uploads

S3 → Create bucket → name e.g. `collabspace-uploads-<something-unique>`,
same region, **Block all public access: on** (the default). Nothing else to
change: the app reads and writes through its IAM role, and every download
goes through the app's permission check.

## 2. ECR repository

ECR → Create repository → Private → name `collabspace`.
Optional but recommended: Lifecycle policy → expire images beyond the 10 most
recent, so old images don't pile up storage costs.

## 3. Secrets in SSM Parameter Store

Systems Manager → Parameter Store → Create parameter, one per line below.
Use **SecureString** for secrets (default AWS-managed key is fine).

| Name | Type | Value |
|---|---|---|
| `/collabspace/prod/DATABASE_URL` | SecureString | Neon **pooled** string (host has `-pooler`) + `&pgbouncer=true&connect_timeout=15` |
| `/collabspace/prod/DIRECT_URL` | SecureString | Neon **direct** string (no `-pooler`), used for migrations |
| `/collabspace/prod/NEXTAUTH_SECRET` | SecureString | the fresh secret from step 0 |
| `/collabspace/prod/NEXTAUTH_URL` | String | `https://your-domain` |
| `/collabspace/prod/LLM_API_KEY` | SecureString | your (new) Groq key |
| `/collabspace/prod/LLM_MODEL` | String | `openai/gpt-oss-120b` |
| `/collabspace/prod/S3_BUCKET` | String | the bucket name from step 1 |

Remove `channel_binding=require` from the Neon strings. Optional SMTP settings
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) go under the
same path. Every parameter under `/collabspace/prod/` becomes an environment
variable in the container, named after the last part of its path.

## 4. IAM role for the EC2 instance

IAM → Roles → Create role → Trusted entity: AWS service → EC2. Attach:
- `AmazonSSMManagedInstanceCore` (Session Manager + Run Command)
- `AmazonEC2ContainerRegistryReadOnly` (pull images)

Then add an inline policy (JSON tab), name it `collabspace-app`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Uploads",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::BUCKET/uploads/*"
    },
    {
      "Sid": "Secrets",
      "Effect": "Allow",
      "Action": ["ssm:GetParametersByPath"],
      "Resource": [
        "arn:aws:ssm:REGION:ACCOUNT_ID:parameter/collabspace/prod",
        "arn:aws:ssm:REGION:ACCOUNT_ID:parameter/collabspace/prod/*"
      ]
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"],
      "Resource": "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/collabspace/*"
    }
  ]
}
```

Name the role `collabspace-ec2`.

## 5. Launch the EC2 instance

EC2 → Launch instance:
- **AMI:** Amazon Linux 2023 (x86_64)
- **Type:** `t3.small` (2 GB) recommended. `t3.micro` (1 GB) works with the
  swap file below, but answers will be slower.
- **Key pair:** none needed (you'll use Session Manager)
- **Security group:** allow **HTTP 80** and **HTTPS 443** from anywhere.
  No SSH rule.
- **Storage:** 20 GB gp3
- **Advanced details → IAM instance profile:** `collabspace-ec2`
- **Advanced details → Metadata response hop limit: 2.** Required: the app
  runs inside a container, one network hop further from the instance's
  credentials than the host. With the default of 1, S3 access fails.

After launch: Elastic IPs → Allocate → Associate with the instance. Point
your domain's **A record** at this Elastic IP.

## 6. Prepare the server (one time)

EC2 → select the instance → Connect → **Session Manager** → Connect. Then:

```bash
sudo su - ec2-user

# Docker + Compose plugin
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# 2 GB swap (a safety net on small instances)
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab

# Deployment files
sudo mkdir -p /opt/collabspace && sudo chown ec2-user:ec2-user /opt/collabspace
git clone https://github.com/YOUR_GITHUB_USER/YOUR_REPO /tmp/repo   # private repo: use a token, or paste the files with nano
cp /tmp/repo/deploy/* /opt/collabspace/ && rm -rf /tmp/repo
cd /opt/collabspace
cp config.env.example config.env
nano config.env        # set AWS_REGION, ECR_REPOSITORY_URI, DOMAIN, SSM_PATH
chmod +x deploy.sh
exit                    # log out and back in (sudo su - ec2-user) so the docker group applies
```

## 7. GitHub Actions → AWS (OIDC, no keys)

**a. Identity provider (once per AWS account).** IAM → Identity providers →
Add provider → OpenID Connect → URL `https://token.actions.githubusercontent.com`,
audience `sts.amazonaws.com`.

**b. Deploy role.** IAM → Roles → Create role → Web identity → that provider,
audience `sts.amazonaws.com`. Then replace its trust policy with:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_USER/YOUR_REPO:ref:refs/heads/main"
      }
    }
  }]
}
```

Only the `main` branch of your repo can assume it. Add this inline
permissions policy, name the role `collabspace-deploy`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "arn:aws:ecr:REGION:ACCOUNT_ID:repository/collabspace"
    },
    {
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:REGION:ACCOUNT_ID:instance/INSTANCE_ID",
        "arn:aws:ssm:REGION::document/AWS-RunShellScript"
      ]
    },
    { "Effect": "Allow", "Action": "ssm:GetCommandInvocation", "Resource": "*" }
  ]
}
```

**c. GitHub settings** (repo → Settings → Secrets and variables → Actions):
- Secret `AWS_DEPLOY_ROLE_ARN` = the role's ARN
- Variables: `AWS_REGION`, `ECR_REPOSITORY` = `collabspace`, `EC2_INSTANCE_ID`

## 8. Deploy

Push to `main` (or Actions → Deploy → Run workflow). The workflow builds the
image (including the embedding model), pushes it to ECR, and runs
`deploy.sh` on the instance, which writes `.env` from Parameter Store, pulls
the image, starts the app and Caddy, runs database migrations, and waits for
the health check. The first build takes several minutes; later builds reuse
the cache.

Open `https://your-domain`. Caddy fetches the certificate on the first
request, so give it a minute if the very first load fails.

**Demo data** (sign up in the app first, then):
```bash
cd /opt/collabspace
docker compose -f docker-compose.prod.yml exec app npm run seed:demo -- --owner you@example.com
```

## 9. Monitoring

- **Logs:** CloudWatch → Log groups → `/collabspace/app`. The `[rag]` lines
  are there too.
- **Alarms:** EC2 → instance → Monitoring → create alarms for
  `StatusCheckFailed > 0` and `CPUUtilization > 80% for 15 minutes`, sending
  to an SNS topic with your email.
- **Health endpoint:** `https://your-domain/api/health` returns `{"ok":true}`
  when the app can reach the database.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Uploads fail with an S3 credentials error | Metadata hop limit still 1 (step 5), or the role's S3 policy names the wrong bucket |
| `deploy.sh`: AccessDenied on GetParametersByPath | Role policy path doesn't match `SSM_PATH` in config.env |
| Workflow fails at "Configure AWS credentials" | Trust policy `sub` doesn't match your repo/branch exactly |
| SSM command stays Pending | Instance lacks `AmazonSSMManagedInstanceCore`, or isn't running |
| HTTPS certificate error | DNS A record not pointing at the Elastic IP yet, or port 80 closed |
| Container restarts, logs show migration errors | `DIRECT_URL` wrong, or it's the pooled string |

## Costs and teardown

Rough on-demand cost: a t3.small with its public IPv4 address and 20 GB of
storage is in the $15–20/month range; a t3.micro is about half. S3, ECR,
Parameter Store (standard parameters) and CloudWatch Logs cost cents at this
scale. New AWS accounts' credits cover this for months. Check AWS's pricing
pages for your region.

To shut it all down: terminate the instance, **release the Elastic IP**
(it's billed while unattached), delete the ECR repository and the S3 bucket.
