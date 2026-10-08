import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permissions";
import { getIO } from "@/lib/io";
import { ragIndex } from "@/lib/rag/queue";

// Replaces the full assignee list for a card. Admin/owner only — assigning
// people to work is treated as a management action, not something any
// member can do to any other member.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const card = await prisma.card.findUnique({ where: { id: params.id }, include: { board: true } });
  if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });

  const requester = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: card.board.workspaceId } },
  });
  if (!requester || !hasRole(requester.role, "ADMIN")) {
    return NextResponse.json({ error: "Only admins and the workspace owner can assign members." }, { status: 403 });
  }

  const { userIds } = await req.json();
  if (!Array.isArray(userIds)) {
    return NextResponse.json({ error: "userIds must be an array." }, { status: 400 });
  }

  // Confirm every proposed assignee is actually a member of this workspace.
  const validMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId: card.board.workspaceId, userId: { in: userIds } },
  });
  const validIds = validMembers.map((m: any) => m.userId);

  await prisma.$transaction([
    prisma.cardAssignee.deleteMany({ where: { cardId: params.id } }),
    prisma.cardAssignee.createMany({ data: validIds.map((uid: string) => ({ cardId: params.id, userId: uid })) }),
  ]);

  const updatedCard = await prisma.card.findUnique({
    where: { id: params.id },
    include: { assignees: { include: { user: { select: { id: true, name: true } } } } },
  });

  getIO()?.to(`board:${card.boardId}`).emit("card:updated", updatedCard);
  ragIndex.card(params.id);

  return NextResponse.json(updatedCard);
}
