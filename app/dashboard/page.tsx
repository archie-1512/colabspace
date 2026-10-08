"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import AppHeader, { Avatar } from "@/components/AppHeader";

type Workspace = {
  id: string;
  name: string;
  description: string;
  _count: { boards: number };
  members: { user: { name: string } }[];
};

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    function load() {
      fetch("/api/workspaces")
        .then((r) => r.json())
        .then((data) => setWorkspaces(data))
        .finally(() => setLoading(false));
    }
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-12 py-12">
        <AppHeader
          title="Your workspaces"
          actions={
            <Link href="/workspace/new" className="bg-indigo text-white rounded-md px-4 py-2.5 text-sm font-medium">
              + Create workspace
            </Link>
          }
        />

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : workspaces.length === 0 ? (
          <div className="border border-dashed border-line rounded-lg p-12 text-center max-w-md">
            <p className="text-sm text-muted">No workspaces yet.</p>
            <Link href="/workspace/new" className="inline-block mt-3 text-sm text-indigo font-medium">
              Create your first one →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {workspaces.map((w, i) => (
              <Link
                key={w.id}
                href={`/workspace/${w.id}`}
                className="bg-white border border-line rounded-lg shadow-card p-6 hover:border-indigo/40 hover:shadow-pop transition-all flex flex-col"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-2 h-2 rounded-full bg-indigo" />
                  <h3 className="font-display font-semibold">{w.name}</h3>
                </div>
                <p className="text-sm text-muted flex-1 line-clamp-2 mb-4">
                  {w.description || "No description provided."}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {w.members.slice(0, 4).map((m, j) => (
                      <Avatar key={j} name={m.user.name} index={j} />
                    ))}
                  </div>
                  <span className="text-xs text-muted font-mono">{w._count.boards} boards</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
