import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Used by the Docker HEALTHCHECK. 200 when the app can reach the database,
// 503 otherwise. Public and cheap: no session, one trivial query.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
