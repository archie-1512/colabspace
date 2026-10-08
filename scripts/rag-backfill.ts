// Indexes everything already in the database. Run once after adding RAG, or any
// time the index might be out of sync:  npm run rag:backfill
import { indexEverything } from "../lib/rag/indexers";
import { prisma } from "../lib/prisma";

indexEverything()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
