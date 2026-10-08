"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Source = { type: "card" | "file" | "dm"; id: string; title: string; href: string; snippet: string; score: number };
type Turn = { question: string; answer: string | null; sources: Source[]; notice?: string; error?: string; pending?: boolean };

const TYPE_LABEL: Record<Source["type"], string> = { card: "Card", file: "File", dm: "DM" };
const TYPE_STYLE: Record<Source["type"], string> = {
  card: "bg-indigoSoft text-indigo",
  file: "bg-amberSoft text-amber",
  dm: "bg-mossSoft text-moss",
};

/**
 * Sources to list under an answer: the ones it actually cites, keeping their
 * original numbers so [n] still matches. Every match is still sent to the
 * model as context; only the display is trimmed. With no written answer
 * (no LLM key / model unreachable), all matches are shown.
 */
function citedSources(answer: string | null, sources: Source[]) {
  const numbered = sources.map((s, i) => ({ s, n: i + 1 }));
  if (!answer) return numbered;
  const cited = new Set(Array.from(answer.matchAll(/\[(\d+)\]/g), (m) => Number(m[1])));
  return numbered.filter(({ n }) => cited.has(n));
}

const SUGGESTIONS = ["What's due this week?", "What is assigned to me?", "What's blocking progress right now?"];

/**
 * Renders the small Markdown subset the model is asked to use: paragraphs,
 * "- " / "1. " lists and **bold**, plus "[1]" citations as links to sources.
 * Hand-rolled on purpose: no raw HTML is ever injected, so model output can't
 * smuggle markup into the page.
 */
function AnswerText({
  text,
  sources,
  onPick,
}: {
  text: string;
  sources: Source[];
  onPick: (e: React.MouseEvent, href: string) => void;
}) {
  function inline(line: string, key: string) {
    return line.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
      const k = `${key}-${i}`;
      const bold = part.match(/^\*\*([^*]+)\*\*$/);
      if (bold) return <strong key={k} className="font-semibold">{bold[1]}</strong>;
      const cite = part.match(/^\[(\d+)\]$/);
      const src = cite ? sources[Number(cite[1]) - 1] : undefined;
      if (src)
        return (
          <Link
            key={k}
            href={src.href}
            title={src.title}
            onClick={(e) => onPick(e, src.href)}
            className="inline-flex items-center justify-center align-super text-[10px] font-mono font-medium bg-indigoSoft text-indigo rounded px-1 mx-0.5 hover:bg-indigo hover:text-white"
          >
            {cite![1]}
          </Link>
        );
      return <span key={k}>{part.replace(/\*\*/g, "")}</span>;
    });
  }

  // Group lines into paragraphs and lists.
  type Block = { kind: "p" | "ul" | "ol"; lines: string[] };
  const blocks: Block[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const kind = bullet ? "ul" : numbered ? "ol" : "p";
    const content = bullet ? bullet[1] : numbered ? numbered[1] : line.replace(/^#+\s*/, "");
    const last = blocks[blocks.length - 1];
    if (last && last.kind === kind && (kind !== "p" || last.lines.length)) last.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }

  return (
    <div className="text-sm text-ink leading-relaxed space-y-2">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.kind === "p" ? (
            <p key={i}>
              {b.lines.map((l, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {inline(l, `${i}-${j}`)}
                </span>
              ))}
            </p>
          ) : (
            (() => {
              const List = b.kind === "ul" ? "ul" : "ol";
              return (
                <List key={i} className={`pl-5 space-y-1 ${b.kind === "ul" ? "list-disc" : "list-decimal"}`}>
                  {b.lines.map((l, j) => (
                    <li key={j}>{inline(l, `${i}-${j}`)}</li>
                  ))}
                </List>
              );
            })()
          )
        )}
    </div>
  );
}

export function AskButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="border border-indigo text-indigo rounded-md px-4 py-2 text-sm font-medium hover:bg-indigoSoft"
    >
      ✦ Ask workspace
    </button>
  );
}

export default function AskPanel({
  workspaceId,
  workspaceName,
  open,
  onClose,
  onSourceClick,
}: {
  workspaceId: string;
  workspaceName?: string;
  open: boolean;
  onClose: () => void;
  /** Return true if the page handled the link itself (e.g. opening a card on the current board). */
  onSourceClick?: (href: string) => boolean;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => t.pending);

  function pick(e: React.MouseEvent, href: string) {
    if (onSourceClick?.(href)) e.preventDefault();
    onClose();
  }

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion("");
    setTurns((prev) => [...prev, { question: text, answer: null, sources: [], pending: true }]);

    let turn: Turn;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json().catch(() => ({}));
      turn = res.ok
        ? { question: text, answer: data.answer, sources: data.sources ?? [], notice: data.notice }
        : { question: text, answer: null, sources: [], error: data.error ?? "Something went wrong." };
    } catch {
      turn = { question: text, answer: null, sources: [], error: "Couldn't reach the server." };
    }
    setTurns((prev) => [...prev.slice(0, -1), turn]);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className="relative w-full max-w-lg h-full bg-paper border-l border-line shadow-pop flex flex-col">
        <header className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-line">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted">Ask workspace</p>
            <h2 className="font-display text-lg font-semibold text-ink">{workspaceName || "This workspace"}</h2>
            <p className="text-xs text-muted mt-1">Answers come from cards, files and your DMs that you have access to.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none px-1" aria-label="Close">
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {turns.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted">Try asking:</p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="block w-full text-left text-sm bg-white border border-line rounded-md px-4 py-2.5 hover:border-indigo"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className="space-y-3">
              <div className="flex justify-end">
                <p className="bg-indigo text-white text-sm rounded-lg px-4 py-2.5 max-w-[85%]">{t.question}</p>
              </div>

              {t.pending ? (
                <p className="text-sm text-muted animate-pulse">Searching the workspace…</p>
              ) : t.error ? (
                <p className="text-sm text-coral">{t.error}</p>
              ) : (
                <div className="bg-white border border-line rounded-lg px-4 py-3.5 space-y-3">
                  {t.answer && <AnswerText text={t.answer} sources={t.sources} onPick={pick} />}
                  {t.notice && <p className="text-xs text-amber">{t.notice}</p>}
                  {citedSources(t.answer, t.sources).length > 0 && (
                    <div className="pt-2 border-t border-line space-y-1.5">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-muted">Sources</p>
                      {citedSources(t.answer, t.sources).map(({ s, n }) => (
                        <Link key={s.type + s.id} href={s.href} onClick={(e) => pick(e, s.href)} className="flex items-start gap-2 text-sm group">
                          <span className="font-mono text-[11px] text-muted w-4 pt-0.5">{n}</span>
                          <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${TYPE_STYLE[s.type]}`}>
                            {TYPE_LABEL[s.type]}
                          </span>
                          <span className="flex-1 text-ink group-hover:text-indigo truncate">{s.title}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="px-6 py-4 border-t border-line flex gap-2">
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(question)}
            placeholder="Ask about tasks, deadlines, files, decisions…"
            maxLength={500}
            className="flex-1 border border-line rounded-md px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-indigo"
          />
          <button
            onClick={() => ask(question)}
            disabled={busy || !question.trim()}
            className="bg-indigo text-white rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-40"
          >
            Ask
          </button>
        </div>
      </aside>
    </div>
  );
}
