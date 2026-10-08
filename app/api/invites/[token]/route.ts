import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const invite = await prisma.invite.findUnique({
    where: { token: params.token },
    include: { workspace: true, invitedBy: { select: { name: true } } },
  });

  if (!invite) return NextResponse.json({ error: "This invite link isn't valid." }, { status: 404 });
  if (invite.status !== "PENDING") {
    return NextResponse.json({ error: "This invite has already been used." }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite has expired. Ask for a new one." }, { status: 410 });
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    type: invite.type,
    workspaceName: invite.workspace.name,
    inviterName: invite.invitedBy.name,
  });
}

export async function DELETE(req: Request, { params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const invite = await prisma.invite.findUnique({ where: { token: params.token } });
  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });

  const userId = (session.user as any).id;
  const requester = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
  });
  if (!requester || !hasRole(requester.role, "ADMIN")) {
    return NextResponse.json({ error: "Only admins and the workspace owner can revoke invites." }, { status: 403 });
  }

  await prisma.invite.delete({ where: { token: params.token } });
  return NextResponse.json({ revoked: true });
}
