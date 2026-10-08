"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-lg shadow-card p-8 mb-6">
      <h2 className="font-display font-semibold text-lg mb-1">{title}</h2>
      {hint && <p className="text-sm text-muted mb-5">{hint}</p>}
      {!hint && <div className="mb-5" />}
      {children}
    </div>
  );
}

export default function NewCardPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [boardTitle, setBoardTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [boards, setBoards] = useState<{ id: string; title: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [defaultVisibility, setDefaultVisibility] = useState<"ALL_MEMBERS" | "ASSIGNED_ONLY">("ALL_MEMBERS");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [trackDueDate, setTrackDueDate] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [enableFiles, setEnableFiles] = useState(false);
  const [enableLinks, setEnableLinks] = useState(false);
  const [visibility, setVisibility] = useState<"ALL_MEMBERS" | "ASSIGNED_ONLY">("ALL_MEMBERS");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/boards/${boardId}`);
      if (res.status === 401) return router.push("/login");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load this board.");
        setLoading(false);
        return;
      }
      if (!data.canCreateCard) {
        setError("This board doesn't allow you to create cards.");
        setLoading(false);
        return;
      }
      setBoardTitle(data.board.title);
      setWorkspaceId(data.board.workspaceId);
      setCanAssign(data.canManageBoard);

      const wsRes = await fetch(`/api/workspaces/${data.board.workspaceId}`);
      if (wsRes.ok) {
        const ws = await wsRes.json();
        setWorkspaceName(ws.name);
        setBoards(ws.boards);
        setMembers(ws.members.map((m: any) => ({ id: m.user.id, name: m.user.name })));
        setDefaultVisibility(ws.cardVisibility);
        setVisibility(ws.cardVisibility);
      }
      setLoading(false);
    }
    load();
  }, [boardId]);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/boards/${boardId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        trackDueDate,
        dueDate: trackDueDate ? dueDate || null : null,
        enableFiles,
        enableLinks,
        visibility,
        assigneeIds,
      }),
    });
    setSubmitting(false);

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      setError("Something went wrong on the server. Check the terminal running `npm run dev`.");
      return;
    }
    if (!res.ok) {
      setError(data?.error ?? "Could not create the card.");
      return;
    }
    router.push(`/board/${boardId}`);
  }

  if (loading)
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 px-12 py-12 text-sm text-muted">Loading…</main>
      </div>
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar workspace={workspaceId ? { id: workspaceId, name: workspaceName, boards } : undefined} />
      <main className="flex-1 px-12 py-12 max-w-4xl">
        <div className="mb-8">
          <p className="text-xs text-muted font-mono uppercase tracking-wider">{boardTitle}</p>
          <h1 className="text-2xl font-display font-semibold mt-0.5">New card</h1>
        </div>

        {error && !title ? (
          <p className="text-sm text-coral">{error}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <Section title="Basics">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                placeholder="Briefly describe the task"
                className="w-full border border-line rounded-md px-4 py-3 text-sm bg-paper mt-1.5 mb-5"
              />
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Description</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Add details, context, or acceptance criteria."
                className="w-full border border-line rounded-md px-4 py-3 text-sm bg-paper mt-1.5 resize-none"
              />
            </Section>

            <Section title="Features" hint="Enable only the features this card requires.">
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={trackDueDate} onChange={(e) => setTrackDueDate(e.target.checked)} className="accent-indigo" />
                  Track a due date
                </label>
                {trackDueDate && (
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="border border-line rounded-md px-3 py-2 text-sm bg-paper ml-6"
                  />
                )}
                <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={enableFiles} onChange={(e) => setEnableFiles(e.target.checked)} className="accent-indigo" />
                  Enable file uploads
                </label>
                <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={enableLinks} onChange={(e) => setEnableLinks(e.target.checked)} className="accent-indigo" />
                  Enable link sharing
                </label>
              </div>
            </Section>

            <Section title="Access">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Who can view this card</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                className="w-full mt-1.5 mb-5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
              >
                <option value="ALL_MEMBERS">All workspace members</option>
                <option value="ASSIGNED_ONLY">Only assigned members (+ admins)</option>
              </select>

              {canAssign && (
                <>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted">Assign members</label>
                  <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto border border-line rounded-md p-3">
                    {members.length === 0 ? (
                      <p className="text-xs text-muted px-1">No other members yet.</p>
                    ) : (
                      members.map((m) => (
                        <label key={m.id} className="flex items-center gap-2.5 text-sm cursor-pointer px-1 py-1">
                          <input type="checkbox" checked={assigneeIds.includes(m.id)} onChange={() => toggleAssignee(m.id)} className="accent-indigo" />
                          {m.name}
                        </label>
                      ))
                    )}
                  </div>
                </>
              )}
            </Section>

            {error && <p className="text-sm text-coral mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="bg-indigo text-white rounded-md px-6 py-3 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? "Creating…" : "Create card"}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/board/${boardId}`)}
                className="text-sm text-muted px-3 py-3"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
