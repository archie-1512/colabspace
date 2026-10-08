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

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteAccess, setInviteAccess] = useState<"ADMIN_ONLY" | "ALL_MEMBERS">("ADMIN_ONLY");
  const [cardVisibility, setCardVisibility] = useState<"ALL_MEMBERS" | "ASSIGNED_ONLY">("ALL_MEMBERS");
  const [memberCanCreateCards, setMemberCanCreateCards] = useState(true);
  const [cardEditAccess, setCardEditAccess] = useState<"ADMIN_ONLY" | "ALL_MEMBERS">("ALL_MEMBERS");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [boards, setBoards] = useState<{ id: string; title: string }[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}`)
      .then(async (r) => {
        if (r.status === 401) return router.push("/login");
        const data = await r.json();
        if (!r.ok) {
          setError(data.error ?? "Could not load this workspace.");
          return;
        }
        if (data.myRole !== "OWNER" && data.myRole !== "ADMIN") {
          setError("Only admins and the owner can view workspace settings.");
          return;
        }
        setName(data.name);
        setDescription(data.description);
        setInviteAccess(data.inviteAccess);
        setCardVisibility(data.cardVisibility);
        setMemberCanCreateCards(data.memberCanCreateCards);
        setCardEditAccess(data.cardEditAccess);
        setBoards(data.boards);
        setWorkspaceName(data.name);
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const res = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, inviteAccess, cardVisibility, memberCanCreateCards, cardEditAccess }),
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
      <Sidebar workspace={{ id: workspaceId, name: workspaceName, boards, canManage: true }} />
      <main className="flex-1 px-12 py-12 max-w-4xl">
        <div className="mb-8">
          <p className="text-xs text-muted font-mono uppercase tracking-wider">Workspace settings</p>
          <h1 className="text-2xl font-display font-semibold mt-0.5">{workspaceName}</h1>
        </div>

        {error ? (
          <p className="text-sm text-coral">{error}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <Section title="Basics">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-line rounded-md px-4 py-3 text-sm bg-paper mt-1.5 mb-5"
              />
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border border-line rounded-md px-4 py-3 text-sm bg-paper mt-1.5 resize-none"
              />
            </Section>

            <Section title="Permissions">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted">Who can send invites</label>
                  <select
                    value={inviteAccess}
                    onChange={(e) => setInviteAccess(e.target.value as any)}
                    className="w-full mt-1.5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
                  >
                    <option value="ADMIN_ONLY">Admins and owner only</option>
                    <option value="ALL_MEMBERS">Any member</option>
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
                  <p className="text-xs text-muted mt-1.5">Boards can still override this individually.</p>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted">Who can edit card details</label>
                  <select
                    value={cardEditAccess}
                    onChange={(e) => setCardEditAccess(e.target.value as any)}
                    className="w-full mt-1.5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
                  >
                    <option value="ALL_MEMBERS">Any member</option>
                    <option value="ADMIN_ONLY">Admins and owner only</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted">Default card visibility</label>
                  <select
                    value={cardVisibility}
                    onChange={(e) => setCardVisibility(e.target.value as any)}
                    className="w-full mt-1.5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
                  >
                    <option value="ALL_MEMBERS">Members can view any card</option>
                    <option value="ASSIGNED_ONLY">Only assigned members can view</option>
                  </select>
                </div>
              </div>
            </Section>

            {error && <p className="text-sm text-coral mb-4">{error}</p>}
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
