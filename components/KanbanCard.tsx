"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CardData } from "./KanbanBoard";
import MemberAvatar from "./MemberAvatar";

const STRIPE: Record<CardData["status"], string> = {
  TODO: "before:bg-grey",
  IN_PROGRESS: "before:bg-amber",
  DONE: "before:bg-moss",
};

function formatDue(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const overdue = diffDays < 0;
  return { label, overdue };
}

export default function KanbanCard({
  card,
  onOpen,
  editingBy,
}: {
  card: CardData;
  onOpen: (card: CardData) => void;
  editingBy?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const due = card.trackDueDate && card.dueDate ? formatDue(card.dueDate) : null;
  const fileCount = card._count?.files ?? 0;
  const linkCount = card._count?.links ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card)}
      className={`relative pl-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded-l-md ${STRIPE[card.status]} bg-white border border-line rounded-md shadow-card p-4 cursor-pointer hover:border-indigo/40 hover:shadow-pop transition-all`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{card.title}</p>
        {card.assignees.length > 0 && (
          <div className="flex -space-x-1.5 shrink-0">
            {card.assignees.slice(0, 3).map((a, i) => (
              <MemberAvatar key={a.user.id} userId={a.user.id} name={a.user.name} index={i} size="sm" />
            ))}
          </div>
        )}
      </div>
      {card.content && <p className="text-sm text-muted mt-2 line-clamp-3">{card.content}</p>}
      {editingBy && (
        <span className="inline-block mt-2.5 text-[11px] font-mono px-1.5 py-0.5 rounded bg-indigoSoft text-indigo mr-1.5">
          {editingBy} is editing…
        </span>
      )}
      {due && (
        <span
          className={`inline-block mt-2.5 text-[11px] font-mono px-1.5 py-0.5 rounded mr-1.5 ${
            due.overdue ? "bg-coral/10 text-coral" : "bg-greySoft text-muted"
          }`}
        >
          {due.overdue ? "overdue · " : "due "}
          {due.label}
        </span>
      )}
      {card.enableFiles && fileCount > 0 && (
        <span className="inline-block mt-2.5 text-[11px] font-mono px-1.5 py-0.5 rounded bg-greySoft text-muted mr-1.5">
          📎 {fileCount}
        </span>
      )}
      {card.enableLinks && linkCount > 0 && (
        <span className="inline-block mt-2.5 text-[11px] font-mono px-1.5 py-0.5 rounded bg-greySoft text-muted">
          🔗 {linkCount}
        </span>
      )}
    </div>
  );
}
