import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCard, canEditCard, hasRole } from "@/lib/permissions";
import { getIO } from "@/lib/io";
import { ragIndex } from "@/lib/rag/queue";

async function checkAccess(cardId: string, userId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { board: { include: { workspace: true } }, assignees: true },
  });
  if (!card) return { card: null, membership: null };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: card.board.workspaceId } },
  });
  if (!membership) return { card: null, membership: null };

  const isAssignee = card.assignees.some((a: any) => a.userId === userId);
  if (!canViewCard(membership.role, card.visibility, isAssignee)) return { card: null, membership: null };

  return { card, membership };
}

const CARD_INCLUDE = {
  assignees: { include: { user: { select: { id: true, name: true } } } },
  _count: { select: { files: true, links: true } },
};

// Optimistic concurrency control: the client sends the `version` it last saw.
// If it doesn't match what's in the database, someone else updated this card
// in between — reject the write and hand back the current version instead of
// silently overwriting their change.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const { card, membership } = await checkAccess(params.id, userId);
  if (!card) return NextResponse.json({ error: "Card not found or access denied." }, { status: 404 });

  const body = await req.json();

  if (typeof body.version === "number" && body.version !== card.version) {
    const latest = await prisma.card.findUnique({ where: { id: params.id }, include: CARD_INCLUDE });
    return NextResponse.json(
      { error: "This card was changed by someone else. Here's the latest version.", conflict: true, latest },
      { status: 409 }
    );
  }

  // Anything that touches the card's content/shape is gated by the
  // workspace's cardEditAccess setting — admins/owner always pass.
  const editingContent =
    typeof body.title === "string" ||
    typeof body.content === "string" ||
    typeof body.status === "string" ||
    typeof body.trackDueDate === "boolean" ||
    typeof body.enableFiles === "boolean" ||
    typeof body.enableLinks === "boolean" ||
    body.dueDate !== undefined;

  if (editingContent && !canEditCard(membership!.role, card.board.workspace.cardEditAccess)) {
    return NextResponse.json({ error: "This workspace doesn't allow members to edit card details." }, { status: 403 });
  }

  // Changing visibility is a management decision, same bar as assigning people.
  if (typeof body.visibility === "string" && !hasRole(membership!.role, "ADMIN")) {
    return NextResponse.json({ error: "Only admins and the workspace owner can change card visibility." }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.content === "string") data.content = body.content;
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.position === "number") data.position = body.position;
  if (typeof body.trackDueDate === "boolean") data.trackDueDate = body.trackDueDate;
  if (typeof body.enableFiles === "boolean") data.enableFiles = body.enableFiles;
  if (typeof body.enableLinks === "boolean") data.enableLinks = body.enableLinks;
  if (body.visibility === "ALL_MEMBERS" || body.visibility === "ASSIGNED_ONLY") data.visibility = body.visibility;
  if (body.dueDate === null) data.dueDate = null;
  else if (typeof body.dueDate === "string") data.dueDate = new Date(body.dueDate);
  if (typeof body.version === "number") data.version = { increment: 1 };

  const updated = await prisma.card.update({ where: { id: params.id }, data, include: CARD_INCLUDE });

  getIO()?.to(`board:${card.boardId}`).emit("card:updated", updated);
  ragIndex.card(params.id);

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const { card, membership } = await checkAccess(params.id, userId);
  if (!card) return NextResponse.json({ error: "Card not found or access denied." }, { status: 404 });
  if (!canEditCard(membership!.role, card.board.workspace.cardEditAccess)) {
    return NextResponse.json({ error: "This workspace doesn't allow members to delete cards." }, { status: 403 });
  }

  const fileIds = (await prisma.cardFile.findMany({ where: { cardId: params.id }, select: { id: true } })).map((f) => f.id);
  await prisma.card.delete({ where: { id: params.id } });
  ragIndex.cardDeleted(params.id, fileIds);

  getIO()?.to(`board:${card.boardId}`).emit("card:deleted", { id: params.id });

  return NextResponse.json({ deleted: true });
}
