"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";
import MemberAvatar from "@/components/MemberAvatar";
import BoardCreateModal from "@/components/BoardCreateModal";
import AskPanel, { AskButton } from "@/components/AskPanel";

type Board = { id: string; title: string; description: string };
type Member = { user: { id: string; name: string; email: string }; role: "OWNER" | "ADMIN" | "MEMBER" };
type Invite = { id: string; email: string | null; role: string; token: string; type: "EMAIL" | "LINK" };
type WorkspaceDetail = {
  id: string;
  name: string;
  description: string;
  inviteAccess: "ADMIN_ONLY" | "ALL_MEMBERS";
  cardVisibility: "ALL_MEMBERS" | "ASSIGNED_ONLY";
  memberCanCreateCards: boolean;
  cardEditAccess: "ADMIN_ONLY" | "ALL_MEMBERS";
  boards: Board[];
  members: Member[];
  invites: Invite[];
  myRole: "OWNER" | "ADMIN" | "MEMBER";
};

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member" };

export default function WorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const workspaceId = params.id as string;
  const currentUserId = session?.user ? (session.user as any).id : "";

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [linkRole, setLinkRole] = useState("MEMBER");
  const [error, setError] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  async function load() {
    const res = await fetch(`/api/workspaces/${workspaceId}`);
    if (res.status === 401) return router.push("/login");
    if (!res.ok) {
      setError("This workspace could not be loaded.");
      setLoading(false);
      return;
    }
    setWorkspace(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [workspaceId]);

  const canManage = workspace?.myRole === "OWNER" || workspace?.myRole === "ADMIN";
  const canInvite = canManage || workspace?.inviteAccess === "ALL_MEMBERS";
  const isOwner = workspace?.myRole === "OWNER";

  async function createBoard(payload: any) {
    const res = await fetch(`/api/workspaces/${workspaceId}/boards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) setWorkspace((prev) => (prev ? { ...prev, boards: [...prev.boards, data] } : prev));
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteMsg("");
    setInviteLink("");
    const res = await fetch(`/api/workspaces/${workspaceId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await res.json();
    if (!res.ok) { setInviteMsg(data.error); return; }
    setWorkspace((prev) => (prev ? { ...prev, invites: [data.invite, ...prev.invites] } : prev));
    setInviteEmail("");
    setInviteMsg(data.emailSent ? `Invite sent to ${data.invite.email}.` : "SMTP isn't configured — share this link manually:");
    if (!data.emailSent) setInviteLink(data.inviteLink);
  }

  async function generateLink() {
    setInviteMsg("");
    const res = await fetch(`/api/workspaces/${workspaceId}/invite-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: linkRole }),
    });
    const data = await res.json();
    if (!res.ok) { setInviteMsg(data.error); return; }
    setWorkspace((prev) => (prev ? { ...prev, invites: [data.invite, ...prev.invites] } : prev));
    setInviteLink(data.inviteLink);
    setInviteMsg("Link generated — copy and share it:");
  }

  function copy(text: string) { navigator.clipboard?.writeText(text); }

  async function revokeInvite(token: string) {
    await fetch(`/api/invites/${token}`, { method: "DELETE" });
    setWorkspace((prev) => (prev ? { ...prev, invites: prev.invites.filter((i) => i.token !== token) } : prev));
  }

  async function changeRole(userId: string, role: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok)
      setWorkspace((prev) =>
        prev ? { ...prev, members: prev.members.map((m) => (m.user.id === userId ? { ...m, role: role as any } : m)) } : prev
      );
  }

  async function removeMember(userId: string) {
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });
    if (res.ok)
      setWorkspace((prev) => (prev ? { ...prev, members: prev.members.filter((m) => m.user.id !== userId) } : prev));
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar workspace={workspace ? { id: workspace.id, name: workspace.name, boards: workspace.boards, canManage } : undefined} />
      <main className="flex-1 px-12 py-12">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error || !workspace ? (
          <p className="text-sm text-coral">{error}</p>
        ) : (
          <>
            <AppHeader
              backHref="/dashboard"
              backLabel="All workspaces"
              eyebrow="Workspace"
              title={workspace.name}
              actions={
                <div className="flex items-center gap-3">
                  <AskButton onClick={() => setAskOpen(true)} />
                  {canManage && (
                    <Link href={`/workspace/${workspace.id}/settings`} className="text-sm text-muted hover:text-ink font-medium">
                      Settings
                    </Link>
                  )}
                </div>
              }
            />

            {workspace.description && (
              <p className="text-sm text-muted mb-10 max-w-2xl">{workspace.description}</p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-2">
                <section className="mb-12">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-mono uppercase tracking-wider text-muted">Boards</h2>
                    <button onClick={() => setShowBoardModal(true)} className="text-sm text-indigo font-medium">
                      + New board
                    </button>
                  </div>

                  {workspace.boards.length === 0 ? (
                    <div className="border border-dashed border-line rounded-lg p-10 text-center">
                      <p className="text-sm text-muted">No boards yet.</p>
                      <button onClick={() => setShowBoardModal(true)} className="text-sm text-indigo font-medium mt-1">
                        Create the first one →
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {workspace.boards.map((b) => (
                        <Link
                          key={b.id}
                          href={`/board/${b.id}`}
                          className="bg-white border border-line rounded-lg shadow-card p-5 hover:border-indigo/40 hover:shadow-pop transition-all"
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-2 h-2 rounded-full bg-grey" />
                            <span className="font-display font-semibold">{b.title}</span>
                          </div>
                          {b.description && <p className="text-sm text-muted line-clamp-2">{b.description}</p>}
                        </Link>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h2 className="text-xs font-mono uppercase tracking-wider text-muted mb-4">Members</h2>
                  <ul className="space-y-2">
                    {workspace.members.map((m, i) => (
                      <li key={m.user.id} className="flex items-center gap-3 text-sm bg-white border border-line rounded-md px-4 py-3">
                        <MemberAvatar userId={m.user.id} name={m.user.name} index={i} currentUserId={currentUserId} />
                        <span className="flex-1">
                          {m.user.name}{" "}
                          <span className="text-muted text-xs">({m.user.email})</span>
                        </span>
                        {isOwner && m.role !== "OWNER" ? (
                          <select
                            value={m.role}
                            onChange={(e) => changeRole(m.user.id, e.target.value)}
                            className="text-xs border border-line rounded-md px-2 py-1 bg-white"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                        ) : (
                          <span className="text-xs font-mono text-muted">{ROLE_LABEL[m.role]}</span>
                        )}
                        {canManage && m.role !== "OWNER" && (
                          <button onClick={() => removeMember(m.user.id)} className="text-xs text-coral font-medium">
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <div>
                <section className="bg-white border border-line rounded-lg shadow-card p-6 mb-6">
                  <h2 className="text-xs font-mono uppercase tracking-wider text-muted mb-3">Permissions</h2>
                  <div className="space-y-1.5 text-sm">
                    <p>Invites: <span className="font-medium">{workspace.inviteAccess === "ALL_MEMBERS" ? "any member" : "admins & owner only"}</span></p>
                    <p>Create cards: <span className="font-medium">{workspace.memberCanCreateCards ? "any member" : "admins & owner only"}</span></p>
                    <p>Edit cards: <span className="font-medium">{workspace.cardEditAccess === "ALL_MEMBERS" ? "any member" : "admins & owner only"}</span></p>
                  </div>
                </section>

                {canInvite && (
                  <section className="bg-white border border-line rounded-lg shadow-card p-6">
                    <h2 className="text-xs font-mono uppercase tracking-wider text-muted mb-4">Invite people</h2>

                    <form onSubmit={invite} className="space-y-2 mb-5">
                      <input
                        type="email"
                        placeholder="Email address"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
                      />
                      <div className="flex gap-2">
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className="flex-1 border border-line rounded-md px-2 py-2.5 text-sm bg-paper"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button type="submit" className="bg-indigo text-white rounded-md px-4 py-2.5 text-sm font-medium">
                          Send invite
                        </button>
                      </div>
                    </form>

                    <div className="border-t border-line pt-4">
                      <p className="text-xs text-muted mb-2">Or share a reusable link — no email needed:</p>
                      <div className="flex gap-2">
                        <select
                          value={linkRole}
                          onChange={(e) => setLinkRole(e.target.value)}
                          className="border border-line rounded-md px-2 py-2.5 text-sm bg-paper"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button
                          type="button"
                          onClick={generateLink}
                          className="flex-1 border border-line rounded-md px-3 py-2.5 text-sm font-medium bg-paper"
                        >
                          Generate link
                        </button>
                      </div>
                    </div>

                    {inviteMsg && <p className="text-sm text-muted mt-3">{inviteMsg}</p>}
                    {inviteLink && (
                      <div className="flex gap-1.5 mt-2">
                        <input
                          readOnly
                          value={inviteLink}
                          onFocus={(e) => e.target.select()}
                          className="flex-1 text-xs font-mono border border-line rounded-md px-2 py-1.5 bg-greySoft"
                        />
                        <button onClick={() => { copy(inviteLink); setInviteMsg("Copied!"); }} className="text-xs border border-line rounded-md px-2 bg-white font-medium">
                          Copy
                        </button>
                      </div>
                    )}

                    {workspace.invites.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-line">
                        <p className="text-xs font-mono uppercase tracking-wider text-muted mb-2">Pending invites</p>
                        <ul className="space-y-1.5">
                          {workspace.invites.map((inv) => (
                            <li key={inv.id} className="flex items-center justify-between text-sm">
                              <span className="truncate">
                                {inv.type === "LINK" ? "Shareable link" : inv.email}{" "}
                                <span className="text-muted text-xs">· {ROLE_LABEL[inv.role]}</span>
                              </span>
                              <div className="flex gap-2 shrink-0 ml-2">
                                <button onClick={() => copy(`${window.location.origin}/invite/${inv.token}`)} className="text-xs text-indigo font-medium">
                                  Copy
                                </button>
                                <button onClick={() => revokeInvite(inv.token)} className="text-xs text-coral font-medium">
                                  Revoke
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>

            {showBoardModal && (
              <BoardCreateModal
                onClose={() => setShowBoardModal(false)}
                onCreate={createBoard}
                defaultVisibility={workspace.cardVisibility}
                defaultMemberCanCreateCards={workspace.memberCanCreateCards}
              />
            )}
          </>
        )}
      </main>
      {workspace && (
        <AskPanel workspaceId={workspace.id} workspaceName={workspace.name} open={askOpen} onClose={() => setAskOpen(false)} />
      )}
    </div>
  );
}
