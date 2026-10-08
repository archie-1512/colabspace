import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permissions";

async function getRequester(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
}

// Change a member's role. Owner only — admins can invite people, but only the
// owner can promote someone else to admin (keeps "who can grant access" to a
// single point of authority, per your "higher authority allots things" model).
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const requesterId = (session.user as any).id;
  const requester = await getRequester(params.id, requesterId);
  if (!requester || !hasRole(requester.role, "OWNER")) {
    return NextResponse.json({ error: "Only the workspace owner can change roles." }, { status: 403 });
  }

  const { role } = await req.json();
  if (role !== "ADMIN" && role !== "MEMBER") {
    return NextResponse.json({ error: "Role must be ADMIN or MEMBER." }, { status: 400 });
  }

  const target = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: params.userId, workspaceId: params.id } },
  });
  if (!target) return NextResponse.json({ error: "That member isn't in this workspace." }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "The workspace owner's role can't be changed." }, { status: 400 });
  }

  const updated = await prisma.workspaceMember.update({
    where: { userId_workspaceId: { userId: params.userId, workspaceId: params.id } },
    data: { role },
  });

  return NextResponse.json(updated);
}

// Remove a member. Owner or admin — but nobody can remove the owner.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const requesterId = (session.user as any).id;
  const requester = await getRequester(params.id, requesterId);
  if (!requester || !hasRole(requester.role, "ADMIN")) {
    return NextResponse.json({ error: "Only admins and the workspace owner can remove members." }, { status: 403 });
  }

  const target = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: params.userId, workspaceId: params.id } },
  });
  if (!target) return NextResponse.json({ error: "That member isn't in this workspace." }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "The workspace owner can't be removed." }, { status: 400 });
  }

  await prisma.workspaceMember.delete({
    where: { userId_workspaceId: { userId: params.userId, workspaceId: params.id } },
  });

  return NextResponse.json({ removed: true });
}
