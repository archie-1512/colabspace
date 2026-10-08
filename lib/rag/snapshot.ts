import { prisma } from "@/lib/prisma";
import { canViewBoard, canViewCard, type Role } from "@/lib/permissions";

const STATUS_LABEL = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" } as const;
const MAX_CARDS = 200; // keeps the prompt small even for a busy workspace
const DAY = 24 * 60 * 60 * 1000;

function relativeDue(due: Date, done: boolean, today: Date) {
  // Compare calendar days (UTC), not timestamps, so "3 days ago at 6pm" is 3 days overdue.
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const days = Math.round((dueDay - today.getTime()) / DAY);
  if (done) return "";
  if (days < 0) return ` (OVERDUE by ${-days} day${days === -1 ? "" : "s"})`;
  if (days === 0) return " (due today)";
  return ` (in ${days} day${days === 1 ? "" : "s"})`;
}

/**
 * The structured half of the hybrid search: a compact, permission-filtered
 * listing of every board and card the user can see, with status, due date and
 * assignees, read live from the database.
 *
 * Vector search is good at "what did we decide about X?" but bad at questions
 * like "what's overdue?" or "how many boards are there?". Those are answered
 * exactly from these columns, so the model gets both.
 */
export async function workspaceSnapshot(userId: string, workspaceId: string): Promise<string> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    include: { workspace: { select: { name: true } } },
  });
  if (!membership) return "";
  const role = membership.role as Role;

  const boards = await prisma.board.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      visibility: true,
      cards: {
        select: {
          title: true,
          status: true,
          visibility: true,
          trackDueDate: true,
          dueDate: true,
          assignees: { select: { userId: true, user: { select: { name: true } } } },
        },
      },
    },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  type Line = { sortKey: number; text: string };
  const boardLines: string[] = [];
  const cardLines: Line[] = [];

  for (const b of boards) {
    const assignedHere = b.cards.some((c) => c.assignees.some((a) => a.userId === userId));
    if (!canViewBoard(role, b.visibility, assignedHere)) continue;

    const visible = b.cards.filter((c) => canViewCard(role, c.visibility, c.assignees.some((a) => a.userId === userId)));
    const counts = (["TODO", "IN_PROGRESS", "DONE"] as const).map(
      (s) => `${visible.filter((c) => c.status === s).length} ${STATUS_LABEL[s].toLowerCase()}`
    );
    boardLines.push(`- ${b.title}: ${visible.length} card${visible.length === 1 ? "" : "s"} (${counts.join(", ")})`);

    for (const c of visible) {
      const due = c.trackDueDate && c.dueDate ? c.dueDate : null;
      const parts = [`status: ${STATUS_LABEL[c.status]}`];
      if (due) parts.push(`due: ${due.toISOString().slice(0, 10)}${relativeDue(due, c.status === "DONE", today)}`);
      parts.push(c.assignees.length ? `assigned: ${c.assignees.map((a) => a.user.name).join(", ")}` : "unassigned");
      // Undone cards with the nearest due dates first, so they survive the cap.
      const sortKey = (c.status === "DONE" ? 2e15 : 0) + (due ? due.getTime() : 1e15);
      cardLines.push({ sortKey, text: `- "${c.title}" [board: ${b.title}] ${parts.join("; ")}` });
    }
  }

  cardLines.sort((a, b) => a.sortKey - b.sortKey);
  const shown = cardLines.slice(0, MAX_CARDS);
  const more = cardLines.length - shown.length;

  return [
    `Workspace: ${membership.workspace.name}`,
    `Today: ${today.toISOString().slice(0, 10)}`,
    `Boards (${boardLines.length}):`,
    boardLines.length ? boardLines.join("\n") : "- none",
    `Cards (${cardLines.length}):`,
    shown.length ? shown.map((l) => l.text).join("\n") : "- none",
    more > 0 ? `(${more} more cards not listed)` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
