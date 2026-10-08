import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Log in (or sign up) with the invited email first." }, { status: 401 });
  }

  const invite = await prisma.invite.findUnique({ where: { token: params.token } });
  if (!invite) return NextResponse.json({ error: "This invite link isn't valid." }, { status: 404 });
  if (invite.status !== "PENDING") {
    return NextResponse.json({ error: "This invite has already been used." }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite has expired. Ask for a new one." }, { status: 410 });
  }

  const sessionEmail = (session.user.email ?? "").toLowerCase();
  if (invite.type === "EMAIL" && sessionEmail !== invite.email) {
    return NextResponse.json(
      { error: `This invite was sent to ${invite.email}. Log in with that email to accept it.` },
      { status: 403 }
    );
  }

  const userId = (session.user as any).id;

  const alreadyMember = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
  });

  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
      create: { userId, workspaceId: invite.workspaceId, role: invite.role },
      update: {},
    }),
    // Targeted email invites are single-use; shareable links stay open for
    // the next person, so only mark email invites as consumed.
    ...(invite.type === "EMAIL" ? [prisma.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED" as const } })] : []),
  ]);

  return NextResponse.json({ workspaceId: invite.workspaceId, alreadyMember: !!alreadyMember });
}
