import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCard, canViewBoard, canCreateCard, canEditCard, hasRole } from "@/lib/permissions";
import { ragIndex } from "@/lib/rag/queue";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const board = await prisma.board.findUnique({ where: { id: params.id }, include: { workspace: true } });
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: board.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "Board not found or access denied." }, { status: 404 });

  const allCards = await prisma.card.findMany({
    where: { boardId: params.id },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { files: true, links: true } },
    },
    orderBy: { position: "asc" },
  });

  const isAssignedToAny = allCards.some((c: any) => c.assignees.some((a: any) => a.userId === userId));
  if (!canViewBoard(membership.role, board.visibility, isAssignedToAny)) {
    return NextResponse.json({ error: "Board not found or access denied." }, { status: 404 });
  }

  // Plain members only see cards that are visible to them; admins/owner see everything.
  const cards = allCards.filter((c: any) =>
    canViewCard(membership.role, c.visibility, c.assignees.some((a: any) => a.userId === userId))
  );

  return NextResponse.json({
    board,
    cards,
    myRole: membership.role,
    canCreateCard: canCreateCard(membership.role, board.memberCanCreateCards),
    canEditCard: canEditCard(membership.role, board.workspace.cardEditAccess),
    canManageBoard: hasRole(membership.role, "ADMIN"),
  });
}

// Body: any subset of { title, description, visibility, memberCanCreateCards }
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const board = await prisma.board.findUnique({ where: { id: params.id } });
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: board.workspaceId } },
  });
  if (!membership || !hasRole(membership.role, "ADMIN")) {
    return NextResponse.json({ error: "Only admins and the owner can change board settings." }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.description === "string") data.description = body.description.trim();
  if (body.visibility === "ALL_MEMBERS" || body.visibility === "ASSIGNED_ONLY") data.visibility = body.visibility;
  if (typeof body.memberCanCreateCards === "boolean") data.memberCanCreateCards = body.memberCanCreateCards;

  const updated = await prisma.board.update({ where: { id: params.id }, data });
  if (data.title && data.title !== board.title) ragIndex.board(params.id); // board name is in each card's indexed text
  return NextResponse.json(updated);
}
