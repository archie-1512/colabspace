import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/io";
import { ragIndex } from "@/lib/rag/queue";
import { canEditCard, canViewBoard, canViewCard, type Role } from "@/lib/permissions";

const STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
type Update = { id: string; status: "TODO" | "IN_PROGRESS" | "DONE"; position: number };

// Body: { boardId: string, updates: { id: string, status: "TODO"|"IN_PROGRESS"|"DONE", position: number }[] }
// Sent whenever a card is dropped — covers reordering within a column and moving across columns,
// since both cases can shift positions for every card in the affected column(s).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const { boardId, updates } = await req.json().catch(() => ({}));
  if (!boardId || !Array.isArray(updates) || updates.length > 500) {
    return NextResponse.json({ error: "boardId and updates array are required." }, { status: 400 });
  }
  const valid = updates.every(
    (u: any) => typeof u?.id === "string" && STATUSES.has(u.status) && Number.isInteger(u.position) && u.position >= 0
  );
  if (!valid) return NextResponse.json({ error: "Each update needs an id, a valid status and a position." }, { status: 400 });

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { workspace: { select: { cardEditAccess: true } } },
  });
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: board.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "You don't have access to this board." }, { status: 403 });
  const role = membership.role as Role;

  const assignedHere = await prisma.cardAssignee.count({ where: { userId, card: { boardId } } });
  if (!canViewBoard(role, board.visibility, assignedHere > 0)) {
    return NextResponse.json({ error: "You don't have access to this board." }, { status: 403 });
  }

  // Every card must belong to THIS board and be visible to the caller. Without
  // this check, any card id from any workspace could be moved through here.
  const ids = Array.from(new Set((updates as Update[]).map((u) => u.id)));
  const cards = await prisma.card.findMany({
    where: { id: { in: ids }, boardId },
    select: { id: true, status: true, visibility: true, assignees: { where: { userId }, select: { userId: true } } },
  });
  const byId = new Map(cards.map((c) => [c.id, c]));
  if (cards.length !== ids.length || cards.some((c) => !canViewCard(role, c.visibility, c.assignees.length > 0))) {
    return NextResponse.json({ error: "One or more cards aren't on this board." }, { status: 400 });
  }

  // Reordering is open to every member, but moving a card to another column
  // changes its status, which follows the same rule as editing the card.
  const changesStatus = (updates as Update[]).some((u) => byId.get(u.id)!.status !== u.status);
  if (changesStatus && !canEditCard(role, board.workspace.cardEditAccess)) {
    return NextResponse.json({ error: "This workspace doesn't allow members to change card status." }, { status: 403 });
  }

  await prisma.$transaction(
    (updates as Update[]).map((u) =>
      prisma.card.update({ where: { id: u.id }, data: { status: u.status, position: u.position } })
    )
  );

  getIO()?.to(`board:${boardId}`).emit("cards:reordered", { updates });
  // Status is part of the indexed text; unchanged cards are skipped cheaply.
  ragIndex.cards(ids);

  return NextResponse.json({ success: true });
}
