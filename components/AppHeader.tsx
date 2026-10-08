"use client";

import Link from "next/link";

export function initialsOf(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = ["bg-indigo", "bg-amber", "bg-moss", "bg-coral"];

export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <div
      className={`w-7 h-7 rounded-full ${AVATAR_COLORS[index % AVATAR_COLORS.length]} text-white text-[11px] font-medium flex items-center justify-center ring-2 ring-paper`}
      title={name}
    >
      {initialsOf(name)}
    </div>
  );
}

// Slim contextual header inside the main content area — primary nav now
// lives in the sidebar, this just covers page title, back link, and presence.
export default function AppHeader({
  backHref,
  backLabel,
  title,
  eyebrow,
  members,
  presence,
  actions,
}: {
  backHref?: string;
  backLabel?: string;
  title: string;
  eyebrow?: string;
  members?: { name: string }[];
  presence?: { name: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        {backHref && (
          <Link href={backHref} className="text-xs text-muted hover:text-ink font-medium tracking-wide">
            ← {backLabel ?? "Back"}
          </Link>
        )}
        {eyebrow && <p className="text-xs text-muted font-mono uppercase tracking-wider mt-1">{eyebrow}</p>}
        <h1 className="text-2xl font-display font-semibold mt-0.5">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {presence && presence.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {presence.slice(0, 5).map((m, i) => (
                <div key={m.name + i} className="relative">
                  <Avatar name={m.name} index={i} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-moss ring-2 ring-white" />
                </div>
              ))}
            </div>
            <span className="text-xs text-muted font-mono">live</span>
          </div>
        )}
        {members && members.length > 0 && (
          <div className="flex -space-x-2">
            {members.slice(0, 5).map((m, i) => (
              <Avatar key={m.name + i} name={m.name} index={i} />
            ))}
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}
