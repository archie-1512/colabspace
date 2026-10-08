#!/usr/bin/env bash
# Pulls a given image tag from ECR and (re)starts the stack.
# Run on the EC2 instance:  /opt/collabspace/deploy.sh <image-tag>
# GitHub Actions calls this through SSM Run Command after each push to main.
set -euo pipefail
cd "$(dirname "$0")"

TAG="${1:-latest}"
# shellcheck disable=SC1091
source ./config.env   # AWS_REGION, ECR_REPOSITORY_URI, DOMAIN, SSM_PATH

echo "==> Writing .env from SSM Parameter Store ($SSM_PATH)"
aws ssm get-parameters-by-path \
  --region "$AWS_REGION" --path "$SSM_PATH" --recursive --with-decryption \
  --query 'Parameters[*].[Name,Value]' --output text |
  while IFS=$'\t' read -r name value; do
    printf '%s=%s\n' "${name##*/}" "$value"
  done > .env.new
printf 'AWS_REGION=%s\n' "$AWS_REGION" >> .env.new
mv .env.new .env
chmod 600 .env

echo "==> Logging in to ECR"
REGISTRY="${ECR_REPOSITORY_URI%%/*}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY"

export APP_IMAGE="$ECR_REPOSITORY_URI:$TAG" AWS_REGION DOMAIN
echo "==> Deploying $APP_IMAGE"
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Waiting for the app to report healthy"
for i in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose -f docker-compose.prod.yml ps -q app)" 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    echo "==> Healthy. Deployed $TAG"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 5
done
echo "!! App did not become healthy in time. Recent logs:"
docker compose -f docker-compose.prod.yml logs --tail 50 app || true
exit 1
