import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Body: { title, description?, visibility?, memberCanCreateCards? }
// memberCanCreateCards/visibility default to the workspace's own defaults
// when omitted, so a board only needs an explicit override if it wants to
// differ from the rest of the workspace.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const userId = (session.user as any).id;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: params.id } },
    include: { workspace: true },
  });
  if (!membership) return NextResponse.json({ error: "You don't have access to this workspace." }, { status: 403 });

  const body = await req.json();
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "Board name is required." }, { status: 400 });

  const visibility = body.visibility === "ASSIGNED_ONLY" ? "ASSIGNED_ONLY" : membership.workspace.cardVisibility;
  const memberCanCreateCards =
    typeof body.memberCanCreateCards === "boolean" ? body.memberCanCreateCards : membership.workspace.memberCanCreateCards;

  const board = await prisma.board.create({
    data: {
      title,
      description: body.description?.trim() ?? "",
      workspaceId: params.id,
      visibility,
      memberCanCreateCards,
    },
  });

  return NextResponse.json(board);
}
