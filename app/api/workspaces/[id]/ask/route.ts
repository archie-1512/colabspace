import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { retrieve } from "@/lib/rag/retrieve";
import { generateAnswer, llmConfigured } from "@/lib/rag/llm";
import { workspaceSnapshot } from "@/lib/rag/snapshot";

// Small per-user limit so one person can't burn through the free LLM quota.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;
const g = globalThis as unknown as { __askHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__askHits ??= new Map());

function rateLimited(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t: number) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > MAX_PER_WINDOW;
}

// Body: { question: string }
// Returns: { answer: string | null, sources: RagSource[], notice?: string }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const userId = (session.user as any).id as string;
  const userName = session.user.name ?? "the user";

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: params.id } },
  });
  if (!membership) return NextResponse.json({ error: "You don't have access to this workspace." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  if (question.length > 500) return NextResponse.json({ error: "Keep questions under 500 characters." }, { status: 400 });
  if (rateLimited(userId)) {
    return NextResponse.json({ error: "Too many questions in a short time. Try again in a minute." }, { status: 429 });
  }

  // Hybrid context: semantic matches from the vector index + a live,
  // permission-filtered overview of boards/cards for structured questions.
  const started = Date.now();
  let sources, snapshot;
  try {
    [sources, snapshot] = await Promise.all([retrieve(userId, params.id, question), workspaceSnapshot(userId, params.id)]);
  } catch (err) {
    console.error("[rag] retrieval failed:", err);
    return NextResponse.json({ error: "Search isn't available right now." }, { status: 500 });
  }

  const cardCount = Number(snapshot.match(/^Cards \((\d+)\)/m)?.[1] ?? 0);
  console.log(
    `[rag] ask "${question.slice(0, 60)}" → ${sources.length} source(s)` +
      (sources.length ? ` [${sources.map((s) => `${s.type} ${s.score}`).join(", ")}]` : "") +
      `, overview ${cardCount} card(s), retrieval ${Date.now() - started}ms`
  );

  if (!llmConfigured()) {
    if (!sources.length) {
      return NextResponse.json({ answer: "I couldn't find anything in this workspace that answers that.", sources: [] });
    }
    return NextResponse.json({
      answer: null,
      sources,
      notice: "No LLM key is set (LLM_API_KEY), so here are the most relevant matches instead of a written answer.",
    });
  }

  try {
    const t = Date.now();
    const answer = await generateAnswer(question, sources, userName, snapshot);
    console.log(`[rag] answer generated in ${Date.now() - t}ms (${process.env.LLM_MODEL || "openai/gpt-oss-120b"})`);
    return NextResponse.json({ answer, sources });
  } catch (err) {
    console.error("[rag] generation failed:", err);
    return NextResponse.json({
      answer: null,
      sources,
      notice: "The AI model couldn't be reached, so here are the most relevant matches instead.",
    });
  }
}
