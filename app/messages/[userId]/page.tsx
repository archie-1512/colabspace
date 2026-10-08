"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";

type Message = { id: string; senderId: string; receiverId: string; content: string; createdAt: string };

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const otherUserId = params.userId as string;
  const userId = session?.user ? (session.user as any).id : "";

  const [otherName, setOtherName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetch(`/api/messages/${otherUserId}`)
      .then(async (r) => {
        if (r.status === 401) return router.push("/login");
        const data = await r.json();
        if (!r.ok) { setError(data.error ?? "Could not load this conversation."); return; }
        setOtherName(data.otherUser.name);
        setMessages(data.messages);
      })
      .finally(() => setLoading(false));
  }, [otherUserId]);

  useEffect(() => {
    if (!userId) return;
    const socket = io({ path: "/api/socket" });
    socketRef.current = socket;
    socket.emit("dm:join", { userId, withUserId: otherUserId });
    socket.on("dm:message", (msg: Message) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    return () => { socket.disconnect(); };
  }, [userId, otherUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const content = draft;
    setDraft("");
    inputRef.current?.focus();

    const res = await fetch(`/api/messages/${otherUserId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (res.ok) setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col px-12 py-12 max-w-3xl">
        <AppHeader backHref="/messages" backLabel="Messages" title={loading ? "…" : otherName || "Conversation"} />

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-coral">{error}</p>
        ) : (
          <>
            <div className="flex-1 space-y-3 mb-6 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-sm text-muted">
                  This is the beginning of your conversation with {otherName}. Say hello!
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.senderId === userId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[72%]">
                        <div
                          className={`text-sm px-4 py-3 rounded-xl ${
                            mine ? "bg-indigo text-white" : "bg-white border border-line"
                          }`}
                        >
                          {m.content}
                        </div>
                        <p className={`text-xs text-muted mt-1 ${mine ? "text-right" : ""}`}>
                          {formatTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="flex gap-2 pt-2 border-t border-line">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${otherName}…`}
                className="flex-1 border border-line rounded-md px-4 py-2.5 text-sm bg-white"
                autoFocus
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="bg-indigo text-white rounded-md px-5 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
