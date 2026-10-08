import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCard, hasRole } from "@/lib/permissions";
import { readStoredFile, deleteStoredFile } from "@/lib/storage";
import { getIO } from "@/lib/io";
import { ragIndex } from "@/lib/rag/queue";

async function loadFileWithAccess(fileId: string, userId: string) {
  const file = await prisma.cardFile.findUnique({
    where: { id: fileId },
    include: { card: { include: { board: true, assignees: true } } },
  });
  if (!file) return { file: null, allowed: false, membership: null };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: file.card.board.workspaceId } },
  });
  if (!membership) return { file: null, allowed: false, membership: null };

  const isAssignee = file.card.assignees.some((a: any) => a.userId === userId);
  const allowed = canViewCard(membership.role, file.card.visibility, isAssignee);
  return { file, allowed, membership };
}

export async function GET(req: Request, { params }: { params: { fileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { file, allowed } = await loadFileWithAccess(params.fileId, (session.user as any).id);
  if (!file || !allowed) return NextResponse.json({ error: "You don't have access to this file." }, { status: 403 });

  const buffer = await readStoredFile(file.storedName);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
    },
  });
}

export async function DELETE(req: Request, { params }: { params: { fileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const { file, allowed, membership } = await loadFileWithAccess(params.fileId, userId);
  if (!file || !allowed) return NextResponse.json({ error: "You don't have access to this file." }, { status: 403 });

  const isUploader = file.uploadedById === userId;
  if (!isUploader && !hasRole(membership!.role, "ADMIN")) {
    return NextResponse.json({ error: "Only the uploader or an admin can delete this file." }, { status: 403 });
  }

  await prisma.cardFile.delete({ where: { id: params.fileId } });
  await deleteStoredFile(file.storedName);
  ragIndex.fileDeleted(params.fileId);

  getIO()?.to(`board:${file.card.boardId}`).emit("card:file-removed", { cardId: file.cardId, fileId: params.fileId });

  return NextResponse.json({ deleted: true });
}
