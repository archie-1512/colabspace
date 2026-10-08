import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permissions";

// Generates a shareable "anyone with this link can join" invite — distinct
// from a targeted email invite. No email is sent; the caller just gets a
// link back to copy and share however they like (Slack, WhatsApp, etc).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const requester = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: params.id } },
    include: { workspace: true },
  });
  if (!requester) return NextResponse.json({ error: "You don't have access to this workspace." }, { status: 403 });
  const requiredRole = requester.workspace.inviteAccess === "ALL_MEMBERS" ? "MEMBER" : "ADMIN";
  if (!hasRole(requester.role, requiredRole)) {
    return NextResponse.json({ error: "This workspace restricts invites to admins and the owner." }, { status: 403 });
  }

  const { role } = await req.json();
  const inviteRole = role === "ADMIN" ? "ADMIN" : "MEMBER";

  const token = randomBytes(24).toString("hex");
  const invite = await prisma.invite.create({
    data: {
      token,
      role: inviteRole,
      type: "LINK",
      workspaceId: params.id,
      invitedById: userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  return NextResponse.json({ invite, inviteLink: `${baseUrl}/invite/${token}` });
}
