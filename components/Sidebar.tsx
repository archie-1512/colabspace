"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { initialsOf } from "./AppHeader";

export type SidebarWorkspace = {
  id: string;
  name: string;
  boards: { id: string; title: string }[];
  canManage?: boolean;
};

type WorkspaceListItem = { id: string; name: string };

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className={`transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
    >
      <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Sidebar({ workspace }: { workspace?: SidebarWorkspace }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const name = session?.user?.name ?? "";

  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [boardsOpen, setBoardsOpen] = useState(true);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => setAllWorkspaces(Array.isArray(data) ? data.map((w: any) => ({ id: w.id, name: w.name })) : []))
      .catch(() => {});
  }, []);

  return (
    <aside className="w-64 shrink-0 border-r border-line bg-white/60 flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-line">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo" />
          <span className="font-display font-semibold tracking-tight">CollabSpace</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <Link
          href="/messages"
          className={`block text-sm px-3 py-2 rounded-md font-medium ${
            pathname.startsWith("/messages") ? "bg-indigoSoft text-indigo" : "text-muted hover:bg-greySoft"
          }`}
        >
          Messages
        </Link>

        <div className="pt-3">
          <button
            onClick={() => setWorkspacesOpen((o) => !o)}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-grey"
          >
            <ChevronIcon open={workspacesOpen} />
            Workspaces
          </button>
          {workspacesOpen && (
            <div className="mt-1 space-y-0.5">
              {allWorkspaces.map((w) => (
                <Link
                  key={w.id}
                  href={`/workspace/${w.id}`}
                  className={`block text-sm px-3 py-1.5 rounded-md truncate ${
                    pathname === `/workspace/${w.id}` ? "bg-indigoSoft text-indigo font-medium" : "text-muted hover:bg-greySoft"
                  }`}
                >
                  {w.name}
                </Link>
              ))}
              <Link href="/workspace/new" className="block text-sm px-3 py-1.5 rounded-md text-indigo font-medium">
                + New workspace
              </Link>
            </div>
          )}
        </div>

        {workspace && (
          <div className="pt-4 mt-2 border-t border-line">
            <p className="px-3 text-xs font-mono uppercase tracking-wider text-grey mb-1">{workspace.name}</p>
            <Link
              href={`/workspace/${workspace.id}`}
              className={`block text-sm px-3 py-1.5 rounded-md font-medium ${
                pathname === `/workspace/${workspace.id}` ? "bg-indigoSoft text-indigo" : "text-muted hover:bg-greySoft"
              }`}
            >
              Overview
            </Link>
            {workspace.canManage && (
              <Link
                href={`/workspace/${workspace.id}/settings`}
                className={`block text-sm px-3 py-1.5 rounded-md font-medium ${
                  pathname === `/workspace/${workspace.id}/settings` ? "bg-indigoSoft text-indigo" : "text-muted hover:bg-greySoft"
                }`}
              >
                Settings
              </Link>
            )}

            <button
              onClick={() => setBoardsOpen((o) => !o)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 mt-1 text-xs font-mono uppercase tracking-wider text-grey"
            >
              <ChevronIcon open={boardsOpen} />
              Boards
            </button>
            {boardsOpen &&
              workspace.boards.map((b) => (
                <Link
                  key={b.id}
                  href={`/board/${b.id}`}
                  className={`block text-sm px-3 py-1.5 rounded-md truncate ${
                    pathname === `/board/${b.id}` ? "bg-indigoSoft text-indigo font-medium" : "text-muted hover:bg-greySoft"
                  }`}
                >
                  {b.title}
                </Link>
              ))}
          </div>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-line flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-indigo text-white text-[11px] font-medium flex items-center justify-center">
          {name ? initialsOf(name) : ""}
        </div>
        <span className="text-sm flex-1 truncate">{name}</span>
        <button onClick={() => signOut({ callbackUrl: "/" })} className="text-xs text-muted hover:text-ink">
          Log out
        </button>
      </div>
    </aside>
  );
}
