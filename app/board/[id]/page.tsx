"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";
import KanbanBoard, { CardData } from "@/components/KanbanBoard";
import { useBoardSocket } from "@/components/useBoardSocket";
import AskPanel, { AskButton } from "@/components/AskPanel";

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const boardId = params.id as string;

  const [boardTitle, setBoardTitle] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceBoards, setWorkspaceBoards] = useState<{ id: string; title: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [myRole, setMyRole] = useState<"OWNER" | "ADMIN" | "MEMBER">("MEMBER");
  const [canCreateCard, setCanCreateCard] = useState(true);
  const [canEditCard, setCanEditCard] = useState(true);
  const [canManageBoard, setCanManageBoard] = useState(false);
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  // Set when arriving from an Ask source link (/board/:id?card=:cardId)
  const [focusCardId, setFocusCardId] = useState<string | null>(null);

  useEffect(() => {
    setFocusCardId(new URLSearchParams(window.location.search).get("card"));
  }, [boardId]);

  async function load() {
    const boardRes = await fetch(`/api/boards/${boardId}`);
    if (boardRes.status === 401) return router.push("/login");
    if (!boardRes.ok) {
      const data = await boardRes.json().catch(() => null);
      setError(data?.error ?? "Could not load this board.");
      setLoading(false);
      return;
    }
    const boardData = await boardRes.json();

    // Kick off the workspace fetch in parallel — don't await the board data
    // before starting it, so both round-trips happen simultaneously.
    const wsPromise = fetch(`/api/workspaces/${boardData.board.workspaceId}`);

    setBoardTitle(boardData.board.title);
    setWorkspaceId(boardData.board.workspaceId);
    setMyRole(boardData.myRole);
    setCanCreateCard(boardData.canCreateCard);
    setCanEditCard(boardData.canEditCard);
    setCanManageBoard(boardData.canManageBoard);
    setCards(boardData.cards);
    setLoading(false); // Show the board immediately while workspace sidebar loads

    const wsRes = await wsPromise;
    if (wsRes.ok) {
      const ws = await wsRes.json();
      setWorkspaceName(ws.name);
      setWorkspaceBoards(ws.boards);
      setMembers(ws.members.map((m: any) => ({ id: m.user.id, name: m.user.name })));
    }
  }

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [boardId]);

  const userId = session?.user ? (session.user as any).id : "";
  const userName = session?.user?.name ?? "Someone";

  const { presence, editingByCard, notifyEditing, notifyEditingStop } = useBoardSocket({
    boardId,
    userId,
    name: userName,
    onCardCreated: (card) => setCards((prev) => (prev.some((c) => c.id === card.id) ? prev : [...prev, card])),
    onCardUpdated: (card) => setCards((prev) => prev.map((c) => (c.id === card.id ? card : c))),
    onCardDeleted: (id) => setCards((prev) => prev.filter((c) => c.id !== id)),
    onCardsReordered: (updates) =>
      setCards((prev) =>
        prev.map((c) => {
          const u = updates.find((u) => u.id === c.id);
          return u ? { ...c, status: u.status as CardData["status"], position: u.position } : c;
        })
      ),
  });

  const others = presence.filter((p) => p.userId !== userId);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        workspace={
          workspaceId
            ? { id: workspaceId, name: workspaceName, boards: workspaceBoards, canManage: canManageBoard }
            : undefined
        }
      />
      <main className="flex-1 px-12 py-12">
        {loading ? (
          <p className="text-sm text-muted">Loading board…</p>
        ) : error ? (
          <p className="text-sm text-coral">{error}</p>
        ) : (
          <>
            <AppHeader
              backHref={workspaceId ? `/workspace/${workspaceId}` : "/dashboard"}
              backLabel="Workspace"
              eyebrow="Board"
              title={boardTitle}
              presence={others}
              actions={
                <div className="flex items-center gap-3">
                  {workspaceId && <AskButton onClick={() => setAskOpen(true)} />}
                  {canManageBoard && (
                    <Link href={`/board/${boardId}/settings`} className="text-sm text-muted hover:text-ink font-medium">
                      Settings
                    </Link>
                  )}
                  {canCreateCard && (
                    <Link
                      href={`/board/${boardId}/cards/new`}
                      className="bg-indigo text-white rounded-md px-4 py-2 text-sm font-medium"
                    >
                      + New card
                    </Link>
                  )}
                </div>
              }
            />

            {!canCreateCard && (
              <p className="text-sm text-muted mb-6 -mt-2">
                Card creation on this board is restricted to admins and the workspace owner.
              </p>
            )}

            <KanbanBoard
              cards={cards}
              setCards={setCards}
              boardId={boardId}
              editingByCard={editingByCard}
              notifyEditing={notifyEditing}
              notifyEditingStop={notifyEditingStop}
              members={members}
              canManage={myRole === "OWNER" || myRole === "ADMIN"}
              canEditCard={canEditCard}
              currentUserId={userId}
              focusCardId={focusCardId}
              onFocusHandled={() => {
                setFocusCardId(null);
                window.history.replaceState(null, "", `/board/${boardId}`);
              }}
            />
          </>
        )}
      </main>
      {workspaceId && (
        <AskPanel
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          open={askOpen}
          onClose={() => setAskOpen(false)}
          onSourceClick={(href) => {
            // A source on this same board: open the card in place instead of navigating.
            const url = new URL(href, window.location.origin);
            if (url.pathname !== `/board/${boardId}`) return false;
            setFocusCardId(url.searchParams.get("card"));
            return true;
          }}
        />
      )}
    </div>
  );
}
