-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "embedding" vector(384),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Embedding_workspaceId_sourceType_idx" ON "Embedding"("workspaceId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_sourceType_sourceId_chunkIndex_key" ON "Embedding"("sourceType", "sourceId", "chunkIndex");
