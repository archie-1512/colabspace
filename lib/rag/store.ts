import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { embed, toVectorLiteral } from "./embed";

export type SourceType = "card" | "file" | "dm";

/**
 * Replaces the stored chunks for one source with `chunks`.
 * Chunks whose text is unchanged keep their existing vector, so routine edits
 * (dragging a card, sending one more DM) only re-embed what actually changed.
 */
export async function upsertChunks(
  sourceType: SourceType,
  sourceId: string,
  workspaceId: string | null,
  chunks: string[]
) {
  const existing = await prisma.$queryRaw<{ chunkIndex: number; content: string }[]>`
    SELECT "chunkIndex", "content" FROM "Embedding"
    WHERE "sourceType" = ${sourceType} AND "sourceId" = ${sourceId}`;
  const byIndex = new Map(existing.map((r) => [r.chunkIndex, r.content]));

  const changed = chunks.map((text, i) => ({ text, i })).filter(({ text, i }) => byIndex.get(i) !== text);
  const vectors = await embed(changed.map((c) => c.text));

  await prisma.$transaction([
    ...changed.map(({ text, i }, n) => {
      const vec = toVectorLiteral(vectors[n]);
      return prisma.$executeRaw`
        INSERT INTO "Embedding" ("id", "workspaceId", "sourceType", "sourceId", "chunkIndex", "content", "embedding", "updatedAt")
        VALUES (${randomUUID()}, ${workspaceId}, ${sourceType}, ${sourceId}, ${i}, ${text}, ${vec}::vector, NOW())
        ON CONFLICT ("sourceType", "sourceId", "chunkIndex")
        DO UPDATE SET "content" = EXCLUDED."content", "embedding" = EXCLUDED."embedding",
                      "workspaceId" = EXCLUDED."workspaceId", "updatedAt" = NOW()`;
    }),
    // Drop chunks past the new end (the text got shorter).
    prisma.$executeRaw`
      DELETE FROM "Embedding"
      WHERE "sourceType" = ${sourceType} AND "sourceId" = ${sourceId} AND "chunkIndex" >= ${chunks.length}`,
    // Workspace id can change only in theory, but keep unchanged chunks consistent anyway.
    prisma.$executeRaw`
      UPDATE "Embedding" SET "workspaceId" = ${workspaceId}
      WHERE "sourceType" = ${sourceType} AND "sourceId" = ${sourceId}
        AND "workspaceId" IS DISTINCT FROM ${workspaceId}`,
  ]);

  return { total: chunks.length, embedded: changed.length };
}

export async function deleteSource(sourceType: SourceType, sourceId: string) {
  await prisma.$executeRaw`DELETE FROM "Embedding" WHERE "sourceType" = ${sourceType} AND "sourceId" = ${sourceId}`;
}

export async function deleteSources(sourceType: SourceType, sourceIds: string[]) {
  if (!sourceIds.length) return;
  await prisma.$executeRaw`DELETE FROM "Embedding" WHERE "sourceType" = ${sourceType} AND "sourceId" = ANY(${sourceIds})`;
}
