"use client";

import { useState } from "react";

export default function BoardCreateModal({
  onClose,
  onCreate,
  defaultVisibility,
  defaultMemberCanCreateCards,
}: {
  onClose: () => void;
  onCreate: (payload: any) => void;
  defaultVisibility: "ALL_MEMBERS" | "ASSIGNED_ONLY";
  defaultMemberCanCreateCards: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [memberCanCreateCards, setMemberCanCreateCards] = useState(defaultMemberCanCreateCards);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title, description, visibility, memberCanCreateCards });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-ink/30 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-pop w-full max-w-lg p-8"
      >
        <h2 className="font-display font-semibold text-lg mb-5">New board</h2>

        <label className="text-xs font-mono uppercase tracking-wider text-muted">Name</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder="Sprint planning"
          className="w-full border border-line rounded-md px-4 py-2.5 text-sm bg-paper mt-1.5 mb-5"
        />

        <label className="text-xs font-mono uppercase tracking-wider text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional"
          className="w-full border border-line rounded-md px-4 py-2.5 text-sm bg-paper mt-1.5 mb-5 resize-none"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
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

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="text-sm text-muted px-3 py-2.5">
            Cancel
          </button>
          <button type="submit" className="bg-indigo text-white rounded-md px-5 py-2.5 text-sm font-medium">
            Create board
          </button>
        </div>
      </form>
    </div>
  );
}
