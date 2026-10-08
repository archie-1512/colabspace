"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default function BoardSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const boardId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"ALL_MEMBERS" | "ASSIGNED_ONLY">("ALL_MEMBERS");
  const [memberCanCreateCards, setMemberCanCreateCards] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [boards, setBoards] = useState<{ id: string; title: string }[]>([]);

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
      if (!data.canManageBoard) {
        setError("Only admins and the workspace owner can view board settings.");
        setLoading(false);
        return;
      }
      setTitle(data.board.title);
      setDescription(data.board.description);
      setVisibility(data.board.visibility);
      setMemberCanCreateCards(data.board.memberCanCreateCards);
      setWorkspaceId(data.board.workspaceId);

      const wsRes = await fetch(`/api/workspaces/${data.board.workspaceId}`);
      if (wsRes.ok) {
        const ws = await wsRes.json();
        setWorkspaceName(ws.name);
        setBoards(ws.boards);
      }
      setLoading(false);
    }
    load();
  }, [boardId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(`/api/boards/${boardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, visibility, memberCanCreateCards }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Could not save settings.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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
      <Sidebar workspace={workspaceId ? { id: workspaceId, name: workspaceName, boards, canManage: true } : undefined} />
      <main className="flex-1 px-12 py-12 max-w-3xl">
        <div className="mb-8">
          <p className="text-xs text-muted font-mono uppercase tracking-wider">Board settings</p>
          <h1 className="text-2xl font-display font-semibold mt-0.5">{title || "Board"}</h1>
        </div>

        {error ? (
          <p className="text-sm text-coral">{error}</p>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-line rounded-lg shadow-card p-8">
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Name</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-line rounded-md px-4 py-3 text-sm bg-paper mt-1.5 mb-5"
            />
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-line rounded-md px-4 py-3 text-sm bg-paper mt-1.5 mb-5 resize-none"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-muted">Visible to</label>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                  className="w-full mt-1.5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
                >
                  <option value="ALL_MEMBERS">All workspace members</option>
                  <option value="ASSIGNED_ONLY">Only members assigned to a card here</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-muted">Who can create cards</label>
                <select
                  value={memberCanCreateCards ? "ALL_MEMBERS" : "ADMIN_ONLY"}
                  onChange={(e) => setMemberCanCreateCards(e.target.value === "ALL_MEMBERS")}
                  className="w-full mt-1.5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
                >
                  <option value="ALL_MEMBERS">Any member</option>
                  <option value="ADMIN_ONLY">Admins and owner only</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-indigo text-white rounded-md px-6 py-3 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saved && <span className="text-sm text-moss">Saved.</span>}
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
