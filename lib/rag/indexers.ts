import path from "path";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";
import { chunkText } from "./chunk";
import { upsertChunks, deleteSource, deleteSources } from "./store";

const STATUS_LABEL = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" } as const;

// ---------- Cards ----------

export async function indexCard(cardId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: {
      board: { select: { title: true, workspaceId: true } },
      assignees: { include: { user: { select: { name: true } } } },
      links: { select: { label: true, url: true } },
    },
  });
  if (!card) return deleteSource("card", cardId);

  const meta = [
    `Card: ${card.title}`,
    `Board: ${card.board.title}`,
    `Status: ${STATUS_LABEL[card.status]}`,
    card.assignees.length ? `Assigned to: ${card.assignees.map((a) => a.user.name).join(", ")}` : "Unassigned",
    card.trackDueDate && card.dueDate ? `Due: ${card.dueDate.toISOString().slice(0, 10)}` : "",
  ].filter(Boolean);

  const links = card.links.length ? `Links: ${card.links.map((l) => `${l.label} (${l.url})`).join(", ")}` : "";
  const body = [card.content, links].filter((s) => s.trim()).join("\n\n");

  return upsertChunks("card", card.id, card.board.workspaceId, chunkText(meta.join("\n"), body));
}

export async function deleteCardIndex(cardId: string, fileIds: string[] = []) {
  await deleteSource("card", cardId);
  await deleteSources("file", fileIds);
}

// ---------- Files ----------

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".log", ".yaml", ".yml", ".xml", ".html", ".js", ".ts", ".py", ".java", ".c", ".cpp", ".sql"]);
const MAX_FILE_CHARS = 60_000; // ~85 chunks; keeps indexing a huge upload bounded

async function extractText(filename: string, mimeType: string, buf: Buffer): Promise<string | null> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf" || mimeType === "application/pdf") {
    const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return text as string;
  }
  if (mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) return buf.toString("utf8");
  return null; // images, zips, etc. — only the filename gets indexed
}

export async function indexFile(fileId: string) {
  const file = await prisma.cardFile.findUnique({
    where: { id: fileId },
    include: { card: { select: { title: true, board: { select: { title: true, workspaceId: true } } } } },
  });
  if (!file) return deleteSource("file", fileId);

  let text: string | null = null;
  try {
    text = await extractText(file.filename, file.mimeType, await readStoredFile(file.storedName));
  } catch (err) {
    console.warn(`[rag] couldn't extract text from ${file.filename}:`, err);
  }

  const header = `File: ${file.filename}\nAttached to card: ${file.card.title} (board: ${file.card.board.title})`;
  const chunks = chunkText(header, (text ?? "").slice(0, MAX_FILE_CHARS));
  return upsertChunks("file", file.id, file.card.board.workspaceId, chunks);
}

// ---------- Direct messages ----------

const DM_WINDOW = 12; // messages per chunk

export function dmKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

export async function indexConversation(userA: string, userB: string) {
  const key = dmKey(userA, userB);
  const [x, y] = key.split(":");
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: x, receiverId: y }, { senderId: y, receiverId: x }] },
    include: { sender: { select: { name: true } }, receiver: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!messages.length) return deleteSource("dm", key);

  const names = [messages[0].sender.name, messages[0].receiver.name].sort();
  const chunks: string[] = [];
  for (let i = 0; i < messages.length; i += DM_WINDOW) {
    const window = messages.slice(i, i + DM_WINDOW);
    const day = window[0].createdAt.toISOString().slice(0, 10);
    const lines = window.map((m) => `${m.sender.name}: ${m.content}`).join("\n");
    chunks.push(`Direct messages between ${names.join(" and ")} (from ${day})\n${lines}`);
  }
  return upsertChunks("dm", key, null, chunks);
}

// ---------- Bulk ----------

export async function indexBoardCards(boardId: string) {
  const cards = await prisma.card.findMany({ where: { boardId }, select: { id: true } });
  for (const c of cards) await indexCard(c.id);
}

export async function indexEverything(log: (msg: string) => void = console.log) {
  const cards = await prisma.card.findMany({ select: { id: true } });
  log(`Indexing ${cards.length} cards…`);
  for (const c of cards) await indexCard(c.id);

  const files = await prisma.cardFile.findMany({ select: { id: true } });
  log(`Indexing ${files.length} files…`);
  for (const f of files) await indexFile(f.id);

  const pairs = await prisma.message.findMany({ select: { senderId: true, receiverId: true }, distinct: ["senderId", "receiverId"] });
  const keys = Array.from(new Set(pairs.map((p) => dmKey(p.senderId, p.receiverId))));
  log(`Indexing ${keys.length} DM conversations…`);
  for (const k of keys) {
    const [a, b] = k.split(":");
    await indexConversation(a, b);
  }
  log("Done.");
}
