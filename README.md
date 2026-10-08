# CollabSpace

A collaborative workspace: landing page → auth → workspaces (roles, granular
permissions, email + link invites) → boards → a real-time Kanban board with
assignment, files, links, and conflict-safe editing. Plus direct messaging.

## New: "Ask workspace" (RAG assistant)

Ask questions in plain English ("what's blocking the launch?", "does the OA
need a webcam?") and get an answer drawn from the workspace's cards, uploaded
files (PDF, Markdown, text, code) and your own DMs, with numbered citations
that open the source card or conversation. Open it with **✦ Ask workspace** on
any workspace or board page.

- **Free to run:** embeddings are computed locally (all-MiniLM-L6-v2 via
  transformers.js, 384 dimensions); answers come from Groq's or Gemini's free
  tier. With no LLM key set, it still returns the most relevant sources.
- **Hybrid retrieval:** vector search (pgvector, in the existing Postgres)
  finds relevant passages, and a live overview of boards and cards (status,
  due dates, assignees) answers structured questions like "what's overdue?"
  that similarity search is bad at.
- **Permission-aware:** you can only retrieve what you could already open.
  Private cards, cards on hidden boards and other people's DMs never reach
  the model.
- **Always in sync:** every write (card create/edit/drag/delete, assignee or
  link change, file upload/delete, new DM, board rename) re-indexes in the
  background. Unchanged chunks keep their vectors, so dragging a card around
  costs almost nothing.

## What changed in this version

**Navigation & layout**
- Persistent sidebar with collapsible "Workspaces" and "Boards" sections
- Logging out now lands on the public landing page, not straight to `/login`
- Wider, more spacious layouts throughout; bigger modals, bigger cards, more
  padding in every form — nothing should feel cramped
- Click anyone's avatar anywhere in the app (members list, card assignees,
  file/link uploader) to see their name and message them directly

**Permissions, made more granular**
- New workspace-level settings: **who can create cards** (any member, or
  admins/owner only) and **who can edit card details** (any member, or
  admins/owner only) — viewing a card is always allowed, editing is now a
  deliberate permission, not implicit
- Boards can override the workspace's card-creation and visibility defaults
  individually, plus get their own name/description
- Boards themselves can be hidden from members who aren't assigned to any
  card in them ("assigned-only" board visibility, not just per-card)
- A real **workspace settings page** and **board settings page** for
  owners/admins to change all of this after creation, not just at setup
- Removed the "no boards" workspace option — every workspace uses boards
  now, which simplified a lot of conditional logic for no real loss

**Cards**
- Creating a card is now a dedicated page (like workspace creation), not a
  cramped popup — same checkbox-driven features (due date, files, links)
- Cards are **view-only by default**. An "Edit" button appears only if
  you're allowed to (per the workspace's card-edit setting); editing is an
  explicit mode with its own Save button, not silent auto-save
- New: **link sharing** alongside file uploads — add a link with a display
  name and a URL; click it to open in a new tab. Same enable/disable
  checkbox pattern as files
- Every file and link shows who added it, with a clickable avatar
- Fixed a bug where a newly created card could briefly appear twice (a race
  between the optimistic local update and the real-time broadcast). Moving
  card creation to its own page removed the redundant local insert that
  caused it.

**Messaging**
- Direct 1:1 messages between any two users. Click an avatar → "Message" →
  a simple chat thread, delivered live via the same Socket.io connection
  used for board presence. An inbox at `/messages` lists recent conversations.

**Performance / freshness**
- Workspace, board, and dashboard pages now refetch automatically when the
  browser tab regains focus, so switching back to the app shows recent
  changes without a manual reload
- One genuine Next.js quirk worth knowing, not a bug: editing a file under
  `app/api/**` never hot-reloads a request that's already in flight — you
  redo the action after saving. Editing a component/page does hot-reload
  normally. If something still looks stale after that, it's a real bug —
  tell me what you changed and I'll look.

## Stack

Same as before: Next.js 14 (App Router) + a custom `server.js` for
Socket.io + PostgreSQL/Prisma + NextAuth + @dnd-kit + nodemailer + local
file storage. See the deployment notes below — both prior caveats
(Socket.io needs a persistent process; uploaded files need a persistent
disk) still apply.

## Local setup

```bash
cp .env.example .env   # fill in DATABASE_URL, NEXTAUTH_SECRET; SMTP and LLM_API_KEY optional
npm install
npx prisma migrate dev
npm run rag:backfill   # one-time: index existing cards, files and DMs
npm run dev
```

**pgvector** must be available on your Postgres. Railway, Supabase and Neon
have it built in. For a local install: `brew install pgvector` (macOS),
`sudo apt install postgresql-16-pgvector` (Ubuntu, match your Postgres
version), or the Windows build steps in the pgvector README. The migration
runs `CREATE EXTENSION vector` itself.

The first time something gets indexed, the embedding model (~23MB) downloads
and is cached; expect that first request to take a few seconds.

**Demo data for testing the assistant:** `npm run seed:demo -- --owner you@example.com`
creates a realistic workspace (3 boards, 14 cards, PDF/Markdown/CSV files, DMs,
a restricted board) with your account as owner. Questions to try, with the
expected answers and permission checks, are in `samples/TEST-QUESTIONS.md`.
Add `--reset` to recreate it.

If you're upgrading from an earlier version of this project, that migration
name is just a label — Prisma will figure out the actual schema diff
(new `Workspace`/`Board` permission fields, dropped `hasBoards`, new
`CardLink` and `Message` models) and may ask to reset your dev database if
it can't reconcile the change cleanly. If it does, you'll need to sign up
again afterward — NextAuth's JWT session will otherwise point at a user
that no longer exists (the exact bug we ran into earlier).

## Run with Docker

```bash
docker compose up --build          # app + Postgres with pgvector, on http://localhost:3000
docker compose exec app npm run seed:demo   # optional demo workspace
```

No `.env` is required; add `LLM_API_KEY` to one for written answers.

## Deployment (AWS)

Production runs as a Docker container on EC2 behind Caddy (automatic HTTPS),
with uploads in S3, secrets in SSM Parameter Store, logs in CloudWatch and
the database on Neon. Every push to `main` builds the image in GitHub
Actions, pushes it to ECR, and deploys through SSM Run Command, using OIDC
instead of stored AWS keys. Full step-by-step guide: [DEPLOY.md](DEPLOY.md).

## Project structure (new/changed pieces)

```
app/
  workspace/[id]/settings/   → workspace settings (owner/admin)
  board/[id]/settings/        → board settings (owner/admin)
  board/[id]/cards/new/       → card creation page
  messages/, messages/[userId]/ → inbox + chat thread
  api/
    workspaces/[id]/route.ts    → now also PATCH (settings)
    boards/[id]/route.ts         → now also PATCH (settings), returns
                                    canCreateCard/canEditCard/canManageBoard
    cards/[id]/links/, links/[linkId]/ → link sharing
    messages/, messages/[userId]/      → conversations + send
components/
  MemberAvatar.tsx   → clickable avatar, hover name, click-to-message
  BoardCreateModal.tsx
lib/permissions.ts    → canViewBoard, canCreateCard, canEditCard added

# RAG
prisma/migrations/20261004120000_add_rag_embeddings/ → pgvector + Embedding table
lib/rag/
  embed.ts      → local MiniLM embeddings (transformers.js)
  chunk.ts      → ~700-char chunks, each prefixed with what it belongs to
  store.ts      → upsert/delete chunks; skips re-embedding unchanged text
  indexers.ts   → turn cards / files (incl. PDF text) / DM threads into chunks
  queue.ts      → background indexing, serialized per source
  retrieve.ts   → vector search + live permission filter
  snapshot.ts   → live overview of visible boards/cards for structured questions
  llm.ts        → answer generation (any OpenAI-compatible API)
app/api/workspaces/[id]/ask/ → POST { question } → { answer, sources }
components/AskPanel.tsx      → the slide-over chat UI with clickable citations
scripts/rag-backfill.ts      → `npm run rag:backfill`
scripts/seed-demo.ts         → `npm run seed:demo` (demo workspace + samples/)

# Deployment
Dockerfile, docker-compose.yml, docker-entrypoint.sh → container build + local stack
deploy/                      → production compose, Caddyfile, deploy.sh, config template
.github/workflows/deploy.yml → build → ECR → deploy via SSM
app/api/health/              → health check used by Docker and deploy.sh
lib/storage.ts               → local disk or S3 (when S3_BUCKET is set)
```

## Things to be ready to explain in an interview

- **Why card editing is a separate permission from card viewing** — most
  Kanban tools conflate "can see it" with "can change it." Splitting them
  lets a workspace be read-heavy/write-restricted (e.g. a status board
  everyone watches but only a few people update) without resorting to
  per-card ACLs for something that's really a workspace-wide policy.
- **Why board visibility is computed from card assignments, not a separate
  membership list** — a board with "only people assigned to a card here"
  visibility doesn't need its own membership table; it's derived from data
  that already exists (`CardAssignee`), which is one less thing to keep in
  sync as people get assigned/unassigned from cards.
- **The duplicate-card bug and what it teaches about optimistic updates** —
  when you optimistically update local state *and* later receive the same
  change over a websocket, both paths need to agree on how to merge,
  usually via an idempotent check (here, "does this id already exist").
  The cleanest fix was actually structural: removing the optimistic insert
  entirely by moving creation to its own page, so there's only one source
  of truth for "a card was added" — the broadcast.
- **Messaging's room-naming scheme** — `dm:<sortedUserIdA>:<sortedUserIdB>`
  gives both participants the same deterministic room regardless of who
  initiated, without needing a persistent "conversation" record just to
  know which socket room to join.
- **Why permissions are checked at query time, not stored in the index** —
  the vector search only scopes by workspace. Every candidate is then
  re-checked against live `Card`/`Board`/`WorkspaceMember` rows using the
  same `canViewCard`/`canViewBoard` functions the REST API uses. If a card
  goes private or someone is unassigned, the assistant reflects it instantly,
  with no re-indexing and no second copy of the permission rules to drift.
  It over-fetches 40 candidates so filtering still leaves enough results.
- **Why the LLM never sees content you can't open** — filtering happens
  before generation, not by asking the model to "ignore" restricted text.
  Source text is also labelled as untrusted data in the prompt, as a basic
  guard against prompt injection hidden inside a card.
- **Why exact search instead of an HNSW index** — every query is filtered to
  one workspace, which at this scale is a few thousand rows at most. An exact
  scan is fast and returns every match, whereas a filtered approximate index
  can silently miss results. HNSW is a one-line migration if it's ever needed.
- **Why indexing is asynchronous and serialized per source** — API responses
  never wait on embedding, and two quick edits to one card can't finish out
  of order and leave the older text in the index.
- **Why hybrid instead of pure vector search** — "what's overdue?" has an
  exact answer in the `dueDate` and `status` columns; embedding similarity
  can only approximate it. So the model gets a small, permission-filtered
  overview of boards and cards for structured questions, and vector-search
  passages for unstructured content (descriptions, files, DMs).
