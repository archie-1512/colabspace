import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;

  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: userId }, { receiverId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      sender: { select: { id: true, name: true } },
      receiver: { select: { id: true, name: true } },
    },
  });

  // Collapse into one row per counterpart, keeping just the most recent message
  // (messages are already newest-first, so the first hit per counterpart wins).
  const byCounterpart = new Map<string, any>();
  for (const m of messages) {
    const counterpart = m.senderId === userId ? m.receiver : m.sender;
    if (!byCounterpart.has(counterpart.id)) {
      byCounterpart.set(counterpart.id, {
        userId: counterpart.id,
        name: counterpart.name,
        lastMessage: m.content,
        lastAt: m.createdAt,
        fromMe: m.senderId === userId,
      });
    }
  }

  return NextResponse.json(Array.from(byCounterpart.values()));
}
