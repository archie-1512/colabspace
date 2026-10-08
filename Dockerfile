# syntax=docker/dockerfile:1
# Multi-stage build: dependencies → build (+ embedding model) → slim runtime.
# Debian (not Alpine) because onnxruntime-node, used for embeddings, needs glibc.

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

# ---- dependencies (cached until package*.json or the schema change) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build ----
FROM deps AS build
COPY . .
RUN npm run build && rm -rf .next/cache
# Bake the embedding model into the image so containers never download it.
ENV RAG_MODEL_CACHE=/app/models
RUN node scripts/download-model.mjs
RUN npm prune --omit=dev

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    RAG_MODEL_CACHE=/app/models \
    UPLOAD_DIR=/app/uploads

COPY --from=build --chown=node:node /app/package.json /app/server.js /app/next.config.mjs /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/models ./models
# For `npm run seed:demo` / `npm run rag:backfill` inside the container:
COPY --from=build --chown=node:node /app/lib ./lib
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/samples ./samples
COPY --chown=node:node docker-entrypoint.sh ./

RUN mkdir -p /app/uploads && chown node:node /app/uploads && chmod +x docker-entrypoint.sh
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
