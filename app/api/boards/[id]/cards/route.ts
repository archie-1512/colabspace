import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole, canCreateCard } from "@/lib/permissions";
import { getIO } from "@/lib/io";
import { ragIndex } from "@/lib/rag/queue";

// Body: { title, content?, trackDueDate?, dueDate?, enableFiles?, enableLinks?, visibility?, assigneeIds? }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const board = await prisma.board.findUnique({ where: { id: params.id }, include: { workspace: true } });
  if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: board.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "You don't have access to this board." }, { status: 403 });
  if (!canCreateCard(membership.role, board.memberCanCreateCards)) {
    return NextResponse.json({ error: "Only admins and the owner can create cards on this board." }, { status: 403 });
  }

  const body = await req.json();
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "Card title is required." }, { status: 400 });

  const lastCard = await prisma.card.findFirst({
    where: { boardId: params.id, status: "TODO" },
    orderBy: { position: "desc" },
  });
  const position = lastCard ? lastCard.position + 1 : 0;

  const trackDueDate = !!body.trackDueDate;
  const enableFiles = !!body.enableFiles;
  const enableLinks = !!body.enableLinks;
  const visibility = body.visibility === "ASSIGNED_ONLY" ? "ASSIGNED_ONLY" : board.workspace.cardVisibility;

  // Assigning members at creation time is an admin/owner action, same as the
  // dedicated assignees endpoint — a plain member creating a card can't hand
  // it to someone else, only admins/owner manage who's on what.
  const canAssign = hasRole(membership.role, "ADMIN");
  const assigneeIds: string[] = canAssign && Array.isArray(body.assigneeIds) ? body.assigneeIds : [];

  const card = await prisma.card.create({
    data: {
      title,
      content: body.content?.trim() ?? "",
      boardId: params.id,
      position,
      status: "TODO",
      trackDueDate,
      dueDate: trackDueDate && body.dueDate ? new Date(body.dueDate) : null,
      enableFiles,
      enableLinks,
      visibility,
      assignees: assigneeIds.length
        ? { create: assigneeIds.map((uid: string) => ({ userId: uid })) }
        : undefined,
    },
    include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
  });

  getIO()?.to(`board:${params.id}`).emit("card:created", card);
  ragIndex.card(card.id);

  return NextResponse.json(card);
}
