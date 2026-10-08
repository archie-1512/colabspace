import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCard } from "@/lib/permissions";
import { generateStoredName, saveFile } from "@/lib/storage";
import { getIO } from "@/lib/io";
import { ragIndex } from "@/lib/rag/queue";

async function checkAccess(cardId: string, userId: string) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { board: true, assignees: true },
  });
  if (!card) return { card: null, allowed: false };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: card.board.workspaceId } },
  });
  if (!membership) return { card: null, allowed: false };

  const isAssignee = card.assignees.some((a: any) => a.userId === userId);
  const allowed = canViewCard(membership.role, card.visibility, isAssignee);
  return { card, allowed };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { allowed } = await checkAccess(params.id, (session.user as any).id);
  if (!allowed) return NextResponse.json({ error: "You don't have access to this card." }, { status: 403 });

  const files = await prisma.cardFile.findMany({
    where: { cardId: params.id },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(files);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const { card, allowed } = await checkAccess(params.id, userId);
  if (!card || !allowed) return NextResponse.json({ error: "You don't have access to this card." }, { status: 403 });
  if (!card.enableFiles) {
    return NextResponse.json({ error: "File uploads aren't enabled on this card." }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Files are limited to 20MB." }, { status: 400 });
  }

  const storedName = generateStoredName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await saveFile(storedName, buffer, file.type || "application/octet-stream");

  const cardFile = await prisma.cardFile.create({
    data: {
      cardId: params.id,
      uploadedById: userId,
      filename: file.name,
      storedName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  getIO()?.to(`board:${card.boardId}`).emit("card:file-added", { cardId: params.id, file: cardFile });

  ragIndex.file(cardFile.id);
  return NextResponse.json(cardFile);
}
