// Fire-and-forget background indexing, called from API routes after a write.
// The HTTP response never waits on embedding. Jobs for the same source run one
// after another, so two quick edits can't finish out of order and leave the
// older text in the index.
//
// This relies on a long-lived Node process (which CollabSpace already needs for
// Socket.io). On serverless, background work after the response may be dropped;
// `npm run rag:backfill` re-syncs everything if that ever happens.
import { indexCard, indexFile, indexConversation, indexBoardCards, deleteCardIndex, dmKey } from "./indexers";
import { deleteSource } from "./store";

const g = globalThis as unknown as { __ragQueue?: Map<string, Promise<unknown>> };
const chains: Map<string, Promise<unknown>> = (g.__ragQueue ??= new Map());

function enqueue(key: string, job: () => Promise<unknown>) {
  if (process.env.RAG_DISABLED === "1") return;
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev
    .then(job)
    .then((result) => {
      // upsertChunks returns { total, embedded }; deletions return nothing.
      const r = result as { total?: number; embedded?: number } | undefined;
      if (r && typeof r.total === "number") {
        const what = r.embedded ? `${r.embedded}/${r.total} chunk(s) embedded` : `unchanged (${r.total} chunk(s))`;
        console.log(`[rag] indexed ${key}: ${what}`);
      } else {
        console.log(`[rag] updated index for ${key}`);
      }
    })
    .catch((err: unknown) => console.error(`[rag] indexing failed for ${key}:`, err))
    .finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
  chains.set(key, next);
}

export const ragIndex = {
  card: (cardId: string) => enqueue(`card:${cardId}`, () => indexCard(cardId)),
  cards: (cardIds: string[]) => cardIds.forEach((id) => ragIndex.card(id)),
  cardDeleted: (cardId: string, fileIds: string[]) => enqueue(`card:${cardId}`, () => deleteCardIndex(cardId, fileIds)),
  board: (boardId: string) => enqueue(`board:${boardId}`, () => indexBoardCards(boardId)),
  file: (fileId: string) => enqueue(`file:${fileId}`, () => indexFile(fileId)),
  fileDeleted: (fileId: string) => enqueue(`file:${fileId}`, () => deleteSource("file", fileId)),
  dm: (a: string, b: string) => enqueue(`dm:${dmKey(a, b)}`, () => indexConversation(a, b)),
};

/** Resolves once every queued job has finished. Used by tests and the backfill script. */
export async function ragIdle() {
  while (chains.size) await Promise.all(Array.from(chains.values()));
}
