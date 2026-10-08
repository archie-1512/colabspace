import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewBoard, hasRole } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: params.id } },
  });
  if (!membership) return NextResponse.json({ error: "You don't have access to this workspace." }, { status: 403 });

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.id },
    include: {
      boards: {
        include: { _count: { select: { cards: true } }, cards: { select: { assignees: { select: { userId: true } } } } },
        orderBy: { createdAt: "asc" },
      },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { id: "asc" },
      },
      invites: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  // Hide boards a plain member isn't allowed to see, and don't leak the raw
  // per-card assignee data used only to compute that.
  const boards = workspace.boards
    .filter((b: any) => {
      const isAssignedToAny = b.cards.some((c: any) => c.assignees.some((a: any) => a.userId === userId));
      return canViewBoard(membership.role, b.visibility, isAssignedToAny);
    })
    .map((b: any) => {
      const { cards, ...rest } = b;
      return rest;
    });

  return NextResponse.json({ ...workspace, boards, myRole: membership.role });
}

// Body: any subset of { name, description, inviteAccess, cardVisibility, memberCanCreateCards, cardEditAccess }
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: params.id } },
  });
  if (!membership || !hasRole(membership.role, "ADMIN")) {
    return NextResponse.json({ error: "Only admins and the owner can change workspace settings." }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description.trim();
  if (body.inviteAccess === "ADMIN_ONLY" || body.inviteAccess === "ALL_MEMBERS") data.inviteAccess = body.inviteAccess;
  if (body.cardVisibility === "ALL_MEMBERS" || body.cardVisibility === "ASSIGNED_ONLY") data.cardVisibility = body.cardVisibility;
  if (typeof body.memberCanCreateCards === "boolean") data.memberCanCreateCards = body.memberCanCreateCards;
  if (body.cardEditAccess === "ADMIN_ONLY" || body.cardEditAccess === "ALL_MEMBERS") data.cardEditAccess = body.cardEditAccess;

  const updated = await prisma.workspace.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}
