"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import AppHeader from "@/components/AppHeader";
import { initialsOf } from "@/components/AppHeader";

type Conversation = { userId: string; name: string; lastMessage: string; lastAt: string; fromMe: boolean };

const AVATAR_COLORS = ["bg-indigo", "bg-amber", "bg-moss", "bg-coral"];

export default function MessagesInboxPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/messages")
      .then(async (r) => {
        if (r.status === 401) return router.push("/login");
        const data = await r.json();
        setConversations(Array.isArray(data) ? data : []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-12 py-12 max-w-3xl">
        <AppHeader title="Messages" />

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : conversations.length === 0 ? (
          <div className="border border-dashed border-line rounded-lg p-12 text-center">
            <p className="text-sm font-medium mb-1">No conversations yet</p>
            <p className="text-sm text-muted">
              Click any member's avatar in a workspace and select <span className="font-medium">Message</span> to start one.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {conversations.map((c, i) => (
              <li key={c.userId}>
                <Link
                  href={`/messages/${c.userId}`}
                  className="flex items-center gap-4 bg-white border border-line rounded-lg shadow-card px-5 py-4 hover:border-indigo/40 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-white text-sm font-medium flex items-center justify-center shrink-0`}>
                    {initialsOf(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-sm text-muted truncate">
                      {c.fromMe ? "You: " : ""}
                      {c.lastMessage}
                    </p>
                  </div>
                  <span className="text-xs text-muted shrink-0">
                    {new Date(c.lastAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
