import { prisma } from "@/lib/prisma";
import { canViewBoard, canViewCard, type Role } from "@/lib/permissions";
import { embed, toVectorLiteral } from "./embed";

export type RagSource = {
  type: "card" | "file" | "dm";
  id: string;
  title: string;
  href: string;
  snippet: string;
  score: number;
};

type Row = { sourceType: "card" | "file" | "dm"; sourceId: string; chunkIndex: number; content: string; distance: number };

const CANDIDATES = 40; // over-fetch, because some candidates get dropped by the permission filter
const MAX_CHUNKS_PER_SOURCE = 2;
// Two cutoffs, so weak matches don't pad out the list:
// - absolute: below this, a chunk is unrelated (MiniLM puts unrelated text at ~0.1–0.3)
// - relative: anything far below the best match is noise compared to it
const MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? 0.3);
const RELATIVE_CUTOFF = 0.65; // keep matches scoring at least 65% of the top one

/**
 * Semantic search over everything `userId` is allowed to see in a workspace.
 *
 * Step 1 (SQL): nearest neighbours, scoped to this workspace's cards/files plus
 *   DM threads the user is part of.
 * Step 2 (TS): every candidate is re-checked against live Card/Board/Member rows
 *   with the same canViewCard/canViewBoard rules the REST API uses. Nothing about
 *   permissions is stored in the index, so a changed visibility setting or a
 *   removed assignee takes effect immediately, with no re-indexing.
 */
export async function retrieve(userId: string, workspaceId: string, query: string, k = 6): Promise<RagSource[]> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!membership) return [];
  const role = membership.role as Role;

  const [qv] = await embed([query]);
  const vec = toVectorLiteral(qv);

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT "sourceType", "sourceId", "chunkIndex", "content", ("embedding" <=> ${vec}::vector) AS distance
    FROM "Embedding"
    WHERE "embedding" IS NOT NULL AND (
      ("workspaceId" = ${workspaceId} AND "sourceType" IN ('card', 'file'))
      OR ("sourceType" = 'dm' AND (split_part("sourceId", ':', 1) = ${userId} OR split_part("sourceId", ':', 2) = ${userId}))
    )
    ORDER BY distance ASC
    LIMIT ${CANDIDATES}`;

  const ids = (t: Row["sourceType"]) => Array.from(new Set(rows.filter((r) => r.sourceType === t).map((r) => r.sourceId)));
  const cardIds = ids("card");
  const fileIds = ids("file");
  const dmKeys = ids("dm");

  // --- Load live data for permission checks ---
  const files = fileIds.length
    ? await prisma.cardFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, filename: true, cardId: true } })
    : [];
  const allCardIds = Array.from(new Set([...cardIds, ...files.map((f) => f.cardId)]));
  const cards = allCardIds.length
    ? await prisma.card.findMany({
        where: { id: { in: allCardIds }, board: { workspaceId } },
        select: {
          id: true,
          title: true,
          visibility: true,
          boardId: true,
          board: { select: { visibility: true } },
          assignees: { select: { userId: true } },
        },
      })
    : [];
  const boardIds = Array.from(new Set(cards.map((c) => c.boardId)));
  const myAssignments = boardIds.length
    ? await prisma.cardAssignee.findMany({
        where: { userId, card: { boardId: { in: boardIds } } },
        select: { card: { select: { boardId: true } } },
      })
    : [];
  const boardsImAssignedIn = new Set(myAssignments.map((a) => a.card.boardId));

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const canSeeCard = (cardId: string) => {
    const c = cardById.get(cardId);
    if (!c) return false;
    if (!canViewBoard(role, c.board.visibility, boardsImAssignedIn.has(c.boardId))) return false;
    return canViewCard(role, c.visibility, c.assignees.some((a) => a.userId === userId));
  };

  // DMs only count if the other person is in this workspace, keeping the assistant on-topic.
  const otherIds = dmKeys.map((key) => key.split(":").find((id) => id !== userId)!);
  const otherMembers = otherIds.length
    ? await prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: otherIds } },
        select: { user: { select: { id: true, name: true } } },
      })
    : [];
  const memberById = new Map(otherMembers.map((m) => [m.user.id, m.user]));
  const fileById = new Map(files.map((f) => [f.id, f]));

  // --- Filter, dedupe, shape ---
  const perSource = new Map<string, number>();
  const out: RagSource[] = [];
  let cutoff = MIN_SCORE;
  for (const r of rows) {
    const score = 1 - Number(r.distance);
    if (score < cutoff) break; // rows are sorted, so everything after is worse
    const key = `${r.sourceType}:${r.sourceId}`;
    if ((perSource.get(key) ?? 0) >= MAX_CHUNKS_PER_SOURCE) continue;

    let src: Omit<RagSource, "snippet" | "score"> | null = null;
    if (r.sourceType === "card" && canSeeCard(r.sourceId)) {
      const c = cardById.get(r.sourceId)!;
      src = { type: "card", id: c.id, title: c.title, href: `/board/${c.boardId}?card=${c.id}` };
    } else if (r.sourceType === "file") {
      const f = fileById.get(r.sourceId);
      if (f && canSeeCard(f.cardId)) {
        const c = cardById.get(f.cardId)!;
        src = { type: "file", id: f.id, title: `${f.filename} (on "${c.title}")`, href: `/board/${c.boardId}?card=${c.id}` };
      }
    } else if (r.sourceType === "dm") {
      const otherId = r.sourceId.split(":").find((id) => id !== userId)!;
      const other = memberById.get(otherId);
      if (other) src = { type: "dm", id: r.sourceId, title: `Your DMs with ${other.name}`, href: `/messages/${other.id}` };
    }
    if (!src) continue;

    // A second matching chunk of the same file/card/DM joins the existing
    // entry instead of showing up as a duplicate source.
    const existing = out.find((o) => o.type === src!.type && o.id === src!.id);
    perSource.set(key, (perSource.get(key) ?? 0) + 1);
    if (existing) {
      existing.snippet += `\n…\n${r.content}`;
      continue;
    }
    if (out.length >= k) continue; // keep scanning: later rows may add chunks to sources already listed
    if (!out.length) cutoff = Math.max(MIN_SCORE, score * RELATIVE_CUTOFF); // first visible hit is the best
    out.push({ ...src, snippet: r.content, score: Math.round(score * 1000) / 1000 });
  }
  return out;
}
