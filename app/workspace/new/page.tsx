"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

type InviteRow = { email: string; role: "MEMBER" | "ADMIN" };

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

export default function NewWorkspacePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteAccess, setInviteAccess] = useState<"ADMIN_ONLY" | "ALL_MEMBERS">("ADMIN_ONLY");
  const [cardVisibility, setCardVisibility] = useState<"ALL_MEMBERS" | "ASSIGNED_ONLY">("ALL_MEMBERS");
  const [memberCanCreateCards, setMemberCanCreateCards] = useState(true);
  const [cardEditAccess, setCardEditAccess] = useState<"ADMIN_ONLY" | "ALL_MEMBERS">("ALL_MEMBERS");
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function addInviteRow() {
    setInvites((prev) => [...prev, { email: "", role: "MEMBER" }]);
  }
  function updateInviteRow(i: number, patch: Partial<InviteRow>) {
    setInvites((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeInviteRow(i: number) {
    setInvites((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Workspace name is required.");
      return;
    }
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        inviteAccess,
        cardVisibility,
        memberCanCreateCards,
        cardEditAccess,
        invites: invites.filter((i) => i.email.trim()),
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
      setError(data?.error ?? "Could not create workspace.");
      return;
    }
    router.push(`/workspace/${data.id}`);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-12 py-12 max-w-4xl">
        <div className="mb-8">
          <p className="text-xs text-muted font-mono uppercase tracking-wider">Workspace</p>
          <h1 className="text-2xl font-display font-semibold mt-0.5">Create a workspace</h1>
          <p className="text-sm text-muted mt-1">
            Set the defaults once — everything here can be changed later from workspace settings.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Section title="Basics">
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Marketing Team"
              className="w-full border border-line rounded-md px-4 py-3 text-sm bg-paper mt-1.5 mb-5"
            />
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this workspace for?"
              className="w-full border border-line rounded-md px-4 py-3 text-sm bg-paper mt-1.5 resize-none"
            />
          </Section>

          <Section title="Permissions" hint="Decide what members can do without an admin's involvement.">
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
                <p className="text-xs text-muted mt-1.5">Everyone can always view a card regardless of this.</p>
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
                <p className="text-xs text-muted mt-1.5">Admins and the owner can always see everything.</p>
              </div>
            </div>
          </Section>

          <Section title="Invite people" hint="Optional — you can invite people anytime from the workspace page.">
            <div className="space-y-2 mb-3">
              {invites.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={row.email}
                    onChange={(e) => updateInviteRow(i, { email: e.target.value })}
                    className="flex-1 border border-line rounded-md px-4 py-2.5 text-sm bg-paper"
                  />
                  <select
                    value={row.role}
                    onChange={(e) => updateInviteRow(i, { role: e.target.value as any })}
                    className="border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  <button type="button" onClick={() => removeInviteRow(i)} className="text-coral text-sm px-2" aria-label="Remove">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addInviteRow} className="text-sm text-indigo font-medium">
              + Add an invite
            </button>
          </Section>

          {error && <p className="text-sm text-coral mb-4">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="bg-indigo text-white rounded-md px-6 py-3 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create workspace"}
          </button>
        </form>
      </main>
    </div>
  );
}
