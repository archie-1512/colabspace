import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/io";
import { ragIndex } from "@/lib/rag/queue";

// Not exported: Next.js route files may only export HTTP handlers, so an
// exported helper here fails `next build`. server.js mirrors this naming.
function dmRoom(userIdA: string, userIdB: string) {
  return `dm:${[userIdA, userIdB].sort().join(":")}`;
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const other = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, name: true } });
  if (!other) return NextResponse.json({ error: "That person doesn't exist." }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: params.userId },
        { senderId: params.userId, receiverId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  return NextResponse.json({ otherUser: other, messages });
}

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  if (userId === params.userId) {
    return NextResponse.json({ error: "You can't message yourself." }, { status: 400 });
  }

  const other = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!other) return NextResponse.json({ error: "That person doesn't exist." }, { status: 404 });

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });

  const message = await prisma.message.create({
    data: { senderId: userId, receiverId: params.userId, content: content.trim() },
  });

  getIO()?.to(dmRoom(userId, params.userId)).emit("dm:message", message);
  ragIndex.dm(userId, params.userId);

  return NextResponse.json(message);
}
