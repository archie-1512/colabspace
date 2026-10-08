"use client";

import { useEffect, useState } from "react";
import { CardData } from "./KanbanBoard";
import MemberAvatar from "./MemberAvatar";

const STATUS_LABEL: Record<CardData["status"], string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

type FileMeta = { id: string; filename: string; size: number; uploadedBy: { id?: string; name: string }; createdAt: string };
type LinkMeta = { id: string; label: string; url: string; addedBy: { id?: string; name: string }; createdAt: string };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CardModal({
  card,
  onClose,
  onSave,
  onDelete,
  members,
  canManage,
  canEdit,
  currentUserId,
  onCardsChange,
}: {
  card: CardData;
  onClose: () => void;
  onSave: (id: string, updates: Partial<CardData>, version: number) => void;
  onDelete: (id: string) => void;
  members: { id: string; name: string }[];
  canManage: boolean;
  canEdit: boolean;
  currentUserId: string;
  onCardsChange: React.Dispatch<React.SetStateAction<CardData[]>>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [content, setContent] = useState(card.content);
  const [status, setStatus] = useState(card.status);
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.slice(0, 10) : "");
  const [visibility, setVisibility] = useState(card.visibility);
  const [assigneeIds, setAssigneeIds] = useState(card.assignees.map((a) => a.user.id));

  const [files, setFiles] = useState<FileMeta[]>([]);
  const [links, setLinks] = useState<LinkMeta[]>([]);
  const [filesLoading, setFilesLoading] = useState(card.enableFiles);
  const [linksLoading, setLinksLoading] = useState(card.enableLinks);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (card.enableFiles) {
      fetch(`/api/cards/${card.id}/files`)
        .then((r) => r.json())
        .then((data) => setFiles(Array.isArray(data) ? data : []))
        .finally(() => setFilesLoading(false));
    }
    if (card.enableLinks) {
      fetch(`/api/cards/${card.id}/links`)
        .then((r) => r.json())
        .then((data) => setLinks(Array.isArray(data) ? data : []))
        .finally(() => setLinksLoading(false));
    }
  }, [card.id, card.enableFiles, card.enableLinks]);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveAssignees() {
    const res = await fetch(`/api/cards/${card.id}/assignees`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: assigneeIds }),
    });
    if (res.ok) {
      const updated = await res.json();
      onCardsChange((prev) => prev.map((c) => (c.id === card.id ? updated : c)));
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFileError("");

    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/cards/${card.id}/files`, { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) {
      setFileError(data.error ?? "Upload failed.");
      return;
    }
    setFiles((prev) => [data, ...prev]);
    e.target.value = "";
  }

  async function deleteFile(fileId: string) {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    await fetch(`/api/files/${fileId}`, { method: "DELETE" });
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkError("");
    if (!linkLabel.trim() || !linkUrl.trim()) return;
    const res = await fetch(`/api/cards/${card.id}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: linkLabel, url: linkUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLinkError(data.error ?? "Could not add that link.");
      return;
    }
    setLinks((prev) => [data, ...prev]);
    setLinkLabel("");
    setLinkUrl("");
    setShowLinkForm(false);
  }

  async function deleteLink(linkId: string) {
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    await fetch(`/api/links/${linkId}`, { method: "DELETE" });
  }

  function startEdit() {
    setTitle(card.title);
    setContent(card.content);
    setStatus(card.status);
    setDueDate(card.dueDate ? card.dueDate.slice(0, 10) : "");
    setVisibility(card.visibility);
    setAssigneeIds(card.assignees.map((a) => a.user.id));
    setEditing(true);
  }

  function handleSaveClick() {
    onSave(card.id, { title, content, status, dueDate: dueDate || null, visibility }, card.version);
    if (canManage) saveAssignees();
    setEditing(false);
  }

  return (
    <div className="fixed inset-0 bg-ink/30 flex items-center justify-center p-6 z-50" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="bg-white rounded-lg shadow-pop w-full max-w-2xl max-h-[88vh] overflow-y-auto p-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full font-display text-2xl font-semibold outline-none bg-transparent"
              placeholder="Card title"
            />
          ) : (
            <h2 className="font-display text-2xl font-semibold">{card.title}</h2>
          )}
          {canEdit && !editing && (
            <button onClick={startEdit} className="text-sm text-indigo font-medium shrink-0 ml-4">
              Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-7">
          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Status</label>
            {editing ? (
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CardData["status"])}
                className="w-full mt-1.5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
              >
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm mt-1.5">{STATUS_LABEL[card.status]}</p>
            )}
          </div>

          {card.trackDueDate && (
            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-muted">Due date</label>
              {editing ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full mt-1.5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
                />
              ) : (
                <p className="text-sm mt-1.5">{card.dueDate ? new Date(card.dueDate).toLocaleDateString() : "Not set"}</p>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Who can view</label>
            {editing && canManage ? (
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as CardData["visibility"])}
                className="w-full mt-1.5 border border-line rounded-md px-3 py-2.5 text-sm bg-paper"
              >
                <option value="ALL_MEMBERS">All workspace members</option>
                <option value="ASSIGNED_ONLY">Only assigned members (+ admins)</option>
              </select>
            ) : (
              <p className="text-sm mt-1.5">
                {card.visibility === "ASSIGNED_ONLY" ? "Assigned members + admins" : "All workspace members"}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Assigned to</label>
            {editing && canManage ? (
              <div className="mt-1.5 space-y-1 max-h-28 overflow-y-auto border border-line rounded-md p-2">
                {members.length === 0 && <p className="text-xs text-muted px-1">No other members yet.</p>}
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5">
                    <input type="checkbox" checked={assigneeIds.includes(m.id)} onChange={() => toggleAssignee(m.id)} className="accent-indigo" />
                    {m.name}
                  </label>
                ))}
              </div>
            ) : card.assignees.length ? (
              <div className="flex flex-wrap gap-2 mt-1.5">
                {card.assignees.map((a, i) => (
                  <div key={a.user.id} className="flex items-center gap-1.5">
                    <MemberAvatar userId={a.user.id} name={a.user.name} index={i} size="sm" currentUserId={currentUserId} />
                    <span className="text-sm">{a.user.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm mt-1.5 text-muted">Nobody assigned</p>
            )}
          </div>
        </div>

        <div className="mb-7">
          <label className="text-xs font-mono uppercase tracking-wider text-muted">Description</label>
          {editing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Add more detail…"
              className="w-full text-sm mt-1.5 bg-paper border border-line rounded-md p-4 outline-none resize-none placeholder:text-grey"
            />
          ) : (
            <p className="text-sm mt-1.5 whitespace-pre-wrap text-ink">{card.content || "No description."}</p>
          )}
        </div>

        {card.enableFiles && (
          <div className="mb-7 border-t border-line pt-6">
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Files</label>
            <div className="mt-3 space-y-2">
              {filesLoading ? (
                <p className="text-xs text-muted">Loading…</p>
              ) : files.length === 0 ? (
                <p className="text-xs text-muted">No files yet.</p>
              ) : (
                files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-sm bg-paper rounded-md px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MemberAvatar userId={f.uploadedBy.id ?? ""} name={f.uploadedBy.name} size="sm" currentUserId={currentUserId} />
                      <a href={`/api/files/${f.id}`} className="text-indigo truncate" download>
                        {f.filename}
                      </a>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-xs text-muted">{formatSize(f.size)}</span>
                      <button onClick={() => deleteFile(f.id)} className="text-coral text-xs">
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <label className="inline-block mt-3 text-sm text-indigo font-medium cursor-pointer">
              {uploading ? "Uploading…" : "+ Upload a file"}
              <input type="file" onChange={handleUpload} disabled={uploading} className="hidden" />
            </label>
            {fileError && <p className="text-xs text-coral mt-1">{fileError}</p>}
          </div>
        )}

        {card.enableLinks && (
          <div className="mb-2 border-t border-line pt-6">
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Links</label>
            <div className="mt-3 space-y-2">
              {linksLoading ? (
                <p className="text-xs text-muted">Loading…</p>
              ) : links.length === 0 ? (
                <p className="text-xs text-muted">No links yet.</p>
              ) : (
                links.map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-sm bg-paper rounded-md px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MemberAvatar userId={l.addedBy.id ?? ""} name={l.addedBy.name} size="sm" currentUserId={currentUserId} />
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-indigo truncate">
                        {l.label}
                      </a>
                    </div>
                    <button onClick={() => deleteLink(l.id)} className="text-coral text-xs shrink-0 ml-2">
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            {showLinkForm ? (
              <form onSubmit={addLink} className="mt-3 bg-paper border border-line rounded-md p-3 space-y-2">
                <input
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="Display name (e.g. Design doc)"
                  className="w-full border border-line rounded-md px-3 py-2 text-sm bg-white"
                  autoFocus
                />
                <input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full border border-line rounded-md px-3 py-2 text-sm bg-white"
                />
                {linkError && <p className="text-xs text-coral">{linkError}</p>}
                <div className="flex gap-2">
                  <button type="submit" className="bg-indigo text-white rounded-md px-3 py-1.5 text-sm font-medium">
                    Add link
                  </button>
                  <button type="button" onClick={() => setShowLinkForm(false)} className="text-sm text-muted px-2">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowLinkForm(true)} className="inline-block mt-3 text-sm text-indigo font-medium">
                + Add a link
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-line">
          {canEdit ? (
            <button
              onClick={() => {
                onDelete(card.id);
                onClose();
              }}
              className="text-sm text-coral font-medium"
            >
              Delete card
            </button>
          ) : (
            <span />
          )}
          {editing ? (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-sm text-muted px-3 py-2.5">
                Cancel
              </button>
              <button onClick={handleSaveClick} className="bg-indigo text-white rounded-md px-5 py-2.5 text-sm font-medium">
                Save changes
              </button>
            </div>
          ) : (
            <button onClick={onClose} className="border border-line rounded-md px-5 py-2.5 text-sm font-medium bg-white">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
