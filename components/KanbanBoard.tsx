"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import KanbanCard from "./KanbanCard";
import CardModal from "./CardModal";

export type CardData = {
  id: string;
  title: string;
  content: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  position: number;
  dueDate: string | null;
  trackDueDate: boolean;
  enableFiles: boolean;
  enableLinks: boolean;
  visibility: "ALL_MEMBERS" | "ASSIGNED_ONLY";
  version: number;
  assignees: { user: { id: string; name: string } }[];
  _count?: { files: number; links: number };
};

const COLUMNS: { key: CardData["status"]; label: string; dot: string }[] = [
  { key: "TODO", label: "To do", dot: "bg-grey" },
  { key: "IN_PROGRESS", label: "In progress", dot: "bg-amber" },
  { key: "DONE", label: "Done", dot: "bg-moss" },
];

function Column({
  status,
  label,
  dot,
  cards,
  editingByCard,
  onOpenCard,
}: {
  status: CardData["status"];
  label: string;
  dot: string;
  cards: CardData[];
  editingByCard: Record<string, string>;
  onOpenCard: (c: CardData) => void;
}) {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div className="flex-1 min-w-[300px]">
      <div className="flex items-center gap-2 mb-4 px-1">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <h3 className="text-sm font-display font-semibold">{label}</h3>
        <span className="text-xs text-muted font-mono">{cards.length}</span>
      </div>
      <div ref={setNodeRef} className="space-y-3 min-h-[60px]">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard key={card.id} card={card} editingBy={editingByCard[card.id]} onOpen={onOpenCard} />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="border border-dashed border-line rounded-md p-4 text-xs text-grey text-center">
            Nothing here yet
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({
  cards,
  setCards,
  boardId,
  editingByCard,
  notifyEditing,
  notifyEditingStop,
  members,
  canManage,
  canEditCard,
  currentUserId,
  focusCardId,
  onFocusHandled,
}: {
  cards: CardData[];
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>;
  boardId: string;
  editingByCard: Record<string, string>;
  notifyEditing: (cardId: string) => void;
  notifyEditingStop: (cardId: string) => void;
  members: { id: string; name: string }[];
  canManage: boolean;
  canEditCard: boolean;
  currentUserId: string;
  focusCardId?: string | null;
  onFocusHandled?: () => void;
}) {
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [conflictNotice, setConflictNotice] = useState("");
  // Board state before the current drag, restored if the server rejects the move.
  const beforeDrag = useRef<CardData[] | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function columnOf(status: CardData["status"]) {
    return cards.filter((c) => c.status === status).sort((a, b) => a.position - b.position);
  }

  function findContainer(id: string): CardData["status"] | undefined {
    if (COLUMNS.some((c) => c.key === id)) return id as CardData["status"];
    return cards.find((c) => c.id === id)?.status;
  }

  function handleDragStart(event: DragStartEvent) {
    const card = cards.find((c) => c.id === event.active.id);
    if (card) setActiveCard(card);
    beforeDrag.current = cards;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setCards((prev) => prev.map((c) => (c.id === active.id ? { ...c, status: overContainer } : c)));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);
    if (!activeContainer || !overContainer) return;

    setCards((prev) => {
      let next = [...prev];
      const overIndex = next.findIndex((c) => c.id === over.id);

      if (activeContainer === overContainer && overIndex !== -1) {
        const colCards = next.filter((c) => c.status === activeContainer).sort((a, b) => a.position - b.position);
        const from = colCards.findIndex((c) => c.id === active.id);
        const to = colCards.findIndex((c) => c.id === over.id);
        if (from === to) return next;
        const reorderedCol = arrayMove(colCards, from, to);
        next = next.map((c) => {
          const idx = reorderedCol.findIndex((rc) => rc.id === c.id);
          return idx === -1 ? c : { ...c, position: idx };
        });
      } else {
        const targetCol = next
          .filter((c) => c.status === overContainer && c.id !== active.id)
          .sort((a, b) => a.position - b.position);
        const insertAt = overIndex === -1 ? targetCol.length : targetCol.findIndex((c) => c.id === over.id);
        const movedCard = { ...next.find((c) => c.id === active.id)!, status: overContainer };
        targetCol.splice(insertAt === -1 ? targetCol.length : insertAt, 0, movedCard);
        next = next.filter((c) => c.status !== overContainer).concat(targetCol.map((c, i) => ({ ...c, position: i })));
      }

      const updates = next
        .filter((c) => c.status === activeContainer || c.status === overContainer)
        .map((c) => ({ id: c.id, status: c.status, position: c.position }));

      const snapshot = beforeDrag.current;
      fetch("/api/cards/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, updates }),
      })
        .then(async (res) => {
          if (res.ok) return;
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Couldn't save that move.");
        })
        .catch((err: Error) => {
          if (snapshot) setCards(snapshot);
          setConflictNotice(err.message || "Couldn't save that move.");
          setTimeout(() => setConflictNotice(""), 5000);
        });

      return next;
    });
  }

  function openCardModal(card: CardData) {
    setOpenCard(card);
    notifyEditing(card.id);
  }

  useEffect(() => {
    if (!focusCardId || !cards.length) return;
    const card = cards.find((c) => c.id === focusCardId);
    if (card) openCardModal(card);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCardId, cards.length]);

  function closeCardModal() {
    if (openCard) notifyEditingStop(openCard.id);
    setOpenCard(null);
  }

  async function handleSave(id: string, updates: Partial<CardData>, version: number) {
    const res = await fetch(`/api/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updates, version }),
    });

    if (res.status === 409) {
      const data = await res.json();
      setConflictNotice("Someone else updated this card while you were editing — showing their latest version.");
      setCards((prev) => prev.map((c) => (c.id === id ? data.latest : c)));
      setTimeout(() => setConflictNotice(""), 5000);
      return;
    }

    const updated = await res.json();
    setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }

  function handleDelete(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    fetch(`/api/cards/${id}`, { method: "DELETE" });
  }

  return (
    <>
      {conflictNotice && (
        <div className="mb-4 text-sm bg-amberSoft text-ink border border-amber/40 rounded-md px-3 py-2">
          {conflictNotice}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-7">
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              status={col.key}
              label={col.label}
              dot={col.dot}
              cards={columnOf(col.key)}
              editingByCard={editingByCard}
              onOpenCard={openCardModal}
            />
          ))}
        </div>
        <DragOverlay>{activeCard && <KanbanCard card={activeCard} onOpen={() => {}} />}</DragOverlay>
      </DndContext>

      {openCard && (
        <CardModal
          card={openCard}
          onClose={closeCardModal}
          onSave={handleSave}
          onDelete={handleDelete}
          members={members}
          canManage={canManage}
          canEdit={canEditCard}
          currentUserId={currentUserId}
          onCardsChange={setCards}
        />
      )}
    </>
  );
}
