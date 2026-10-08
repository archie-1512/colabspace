import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendInviteEmail } from "@/lib/mail";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId } } },
    include: { members: { include: { user: true } }, _count: { select: { boards: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(workspaces);
}

// Body: { name, description?, inviteAccess?, cardVisibility?, memberCanCreateCards?, cardEditAccess?, invites?: { email, role }[] }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const userName = session.user.name ?? "Someone";
  const body = await req.json();
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Workspace name is required." }, { status: 400 });

  const inviteAccess = body.inviteAccess === "ALL_MEMBERS" ? "ALL_MEMBERS" : "ADMIN_ONLY";
  const cardVisibility = body.cardVisibility === "ASSIGNED_ONLY" ? "ASSIGNED_ONLY" : "ALL_MEMBERS";
  const memberCanCreateCards = body.memberCanCreateCards !== false;
  const cardEditAccess = body.cardEditAccess === "ADMIN_ONLY" ? "ADMIN_ONLY" : "ALL_MEMBERS";

  let workspace;
  try {
    workspace = await prisma.workspace.create({
      data: {
        name,
        description: body.description?.trim() ?? "",
        inviteAccess,
        cardVisibility,
        memberCanCreateCards,
        cardEditAccess,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
  } catch (err: any) {
    // P2003 here almost always means the session's user id doesn't exist in
    // the database anymore — e.g. the dev DB got reset by a migration after
    // the browser already had a (JWT, so still "valid") session cookie for a
    // user that no longer exists. Give a clear, actionable error instead of
    // a raw 500.
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: "Your session refers to an account that no longer exists. Log out and sign in again." },
        { status: 409 }
      );
    }
    console.error("Failed to create workspace:", err);
    return NextResponse.json({ error: "Something went wrong creating the workspace." }, { status: 500 });
  }

  // Send out any invites collected on the creation form.
  const invites: { email: string; role: string; token: string; emailSent: boolean }[] = [];
  const rawInvites: { email: string; role: string }[] = Array.isArray(body.invites) ? body.invites : [];

  for (const inv of rawInvites) {
    const email = inv.email?.toLowerCase().trim();
    if (!email) continue;
    const role = inv.role === "ADMIN" ? "ADMIN" : "MEMBER";
    const token = randomBytes(24).toString("hex");

    try {
      await prisma.invite.create({
        data: {
          email,
          token,
          role,
          type: "EMAIL",
          workspaceId: workspace.id,
          invitedById: userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const baseUrl = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
      const inviteLink = `${baseUrl}/invite/${token}`;
      const emailSent = await sendInviteEmail({ to: email, workspaceName: name, inviterName: userName, inviteLink });
      invites.push({ email, role, token, emailSent });
    } catch (err) {
      console.error(`Failed to create invite for ${email}:`, err);
    }
  }

  return NextResponse.json({ ...workspace, sentInvites: invites });
}
