import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/permissions";
import { sendInviteEmail } from "@/lib/mail";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const requester = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: params.id } },
    include: { workspace: true, user: true },
  });
  if (!requester) return NextResponse.json({ error: "You don't have access to this workspace." }, { status: 403 });
  const requiredRole = requester.workspace.inviteAccess === "ALL_MEMBERS" ? "MEMBER" : "ADMIN";
  if (!hasRole(requester.role, requiredRole)) {
    return NextResponse.json({ error: "This workspace restricts invites to admins and the owner." }, { status: 403 });
  }

  const { email, role } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "An email is required." }, { status: 400 });
  const normalizedEmail = email.toLowerCase().trim();
  const inviteRole = role === "ADMIN" ? "ADMIN" : "MEMBER"; // never let a request mint an OWNER invite

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    const existingMembership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: existingUser.id, workspaceId: params.id } },
    });
    if (existingMembership) {
      return NextResponse.json({ error: "That person is already a member of this workspace." }, { status: 409 });
    }
  }

  const pendingInvite = await prisma.invite.findFirst({
    where: { workspaceId: params.id, email: normalizedEmail, status: "PENDING" },
  });
  if (pendingInvite) {
    return NextResponse.json({ error: "There's already a pending invite for that email." }, { status: 409 });
  }

  const token = randomBytes(24).toString("hex");
  const invite = await prisma.invite.create({
    data: {
      email: normalizedEmail,
      token,
      role: inviteRole,
      workspaceId: params.id,
      invitedById: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const inviteLink = `${baseUrl}/invite/${token}`;

  const emailSent = await sendInviteEmail({
    to: normalizedEmail,
    workspaceName: requester.workspace.name,
    inviterName: requester.user.name,
    inviteLink,
  });

  return NextResponse.json({ invite, inviteLink, emailSent });
}
