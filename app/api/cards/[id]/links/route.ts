import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCard } from "@/lib/permissions";
import { ragIndex } from "@/lib/rag/queue";

async function checkAccess(cardId: string, userId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: { board: true, assignees: true } });
  if (!card) return { card: null, allowed: false };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: card.board.workspaceId } },
  });
  if (!membership) return { card: null, allowed: false };

  const isAssignee = card.assignees.some((a: any) => a.userId === userId);
  const allowed = canViewCard(membership.role, card.visibility, isAssignee);
  return { card, allowed };
}

function normalizeUrl(raw: string) {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { allowed } = await checkAccess(params.id, (session.user as any).id);
  if (!allowed) return NextResponse.json({ error: "You don't have access to this card." }, { status: 403 });

  const links = await prisma.cardLink.findMany({
    where: { cardId: params.id },
    include: { addedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(links);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const { card, allowed } = await checkAccess(params.id, userId);
  if (!card || !allowed) return NextResponse.json({ error: "You don't have access to this card." }, { status: 403 });
  if (!card.enableLinks) {
    return NextResponse.json({ error: "Link sharing isn't enabled on this card." }, { status: 400 });
  }

  const { label, url } = await req.json();
  if (!label?.trim() || !url?.trim()) {
    return NextResponse.json({ error: "A display name and a URL are both required." }, { status: 400 });
  }

  let safeUrl: string;
  try {
    safeUrl = normalizeUrl(url.trim());
    new URL(safeUrl);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  const link = await prisma.cardLink.create({
    data: { cardId: params.id, addedById: userId, label: label.trim(), url: safeUrl },
    include: { addedBy: { select: { id: true, name: true } } },
  });

  ragIndex.card(params.id);
  return NextResponse.json(link);
}
