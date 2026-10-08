"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export type PresenceUser = { userId: string; name: string };

export function useBoardSocket({
  boardId,
  userId,
  name,
  onCardCreated,
  onCardUpdated,
  onCardDeleted,
  onCardsReordered,
}: {
  boardId: string;
  userId: string;
  name: string;
  onCardCreated: (card: any) => void;
  onCardUpdated: (card: any) => void;
  onCardDeleted: (cardId: string) => void;
  onCardsReordered: (updates: { id: string; status: string; position: number }[]) => void;
}) {
  const socketRef = useRef<Socket | null>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [editingByCard, setEditingByCard] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) return; // wait for the session to finish loading before joining

    const socket = io({ path: "/api/socket" });
    socketRef.current = socket;

    socket.emit("join-board", { boardId, userId, name });

    socket.on("presence:update", (users: PresenceUser[]) => setPresence(users));

    socket.on("card:editing", ({ cardId, name: editorName }: { cardId: string; name: string }) => {
      setEditingByCard((prev) => ({ ...prev, [cardId]: editorName }));
    });
    socket.on("card:editing-stop", ({ cardId }: { cardId: string }) => {
      setEditingByCard((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
    });

    socket.on("card:created", onCardCreated);
    socket.on("card:updated", onCardUpdated);
    socket.on("card:deleted", ({ id }: { id: string }) => onCardDeleted(id));
    socket.on("cards:reordered", ({ updates }: { updates: any[] }) => onCardsReordered(updates));

    return () => {
      socket.disconnect();
    };
    // Re-connect when the board changes or once the session finishes loading
    // (userId flips from "" to a real id) — handlers are stable enough otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, userId]);

  function notifyEditing(cardId: string) {
    socketRef.current?.emit("card:editing", { boardId, cardId, name });
  }
  function notifyEditingStop(cardId: string) {
    socketRef.current?.emit("card:editing-stop", { boardId, cardId });
  }

  return { presence, editingByCard, notifyEditing, notifyEditingStop };
}
