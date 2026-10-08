import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permissions";
import { ragIndex } from "@/lib/rag/queue";

export async function DELETE(req: Request, { params }: { params: { linkId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const link = await prisma.cardLink.findUnique({ where: { id: params.linkId }, include: { card: { include: { board: true } } } });
  if (!link) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: link.card.board.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "You don't have access to this card." }, { status: 403 });

  const isAdder = link.addedById === userId;
  if (!isAdder && !hasRole(membership.role, "ADMIN")) {
    return NextResponse.json({ error: "Only whoever added this link or an admin can remove it." }, { status: 403 });
  }

  await prisma.cardLink.delete({ where: { id: params.linkId } });
  ragIndex.card(link.cardId);
  return NextResponse.json({ deleted: true });
}
