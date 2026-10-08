"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { initialsOf } from "./AppHeader";

const COLORS = ["bg-indigo", "bg-amber", "bg-moss", "bg-coral"];

export default function MemberAvatar({
  userId,
  name,
  index = 0,
  size = "md",
  currentUserId,
}: {
  userId: string;
  name: string;
  index?: number;
  size?: "sm" | "md";
  currentUserId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dims = size === "sm" ? "w-5 h-5 text-[9px]" : "w-7 h-7 text-[11px]";
  const isSelf = currentUserId === userId;

  function openPopover(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (isSelf || !userId) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function close() { setOpen(false); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const popover = open && typeof document !== "undefined"
    ? createPortal(
        <div
          // minHeight: globals.css gives every direct child of <body> min-height: 100vh,
          // and this portal renders straight into <body>.
          style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999, minHeight: 0 }}
          className="bg-white border border-line rounded-md shadow-pop py-1.5 min-w-[160px]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-medium px-3 py-1.5 text-ink border-b border-line mb-1">{name}</p>
          <button
            onClick={() => { setOpen(false); router.push(`/messages/${userId}`); }}
            className="w-full text-left text-sm text-indigo px-3 py-1.5 hover:bg-indigoSoft"
          >
            Send a message
          </button>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={name}
        onClick={openPopover}
        onPointerDown={(e) => e.stopPropagation()} // prevent DnD kit from hijacking the click
        className={`${dims} rounded-full ${COLORS[index % COLORS.length]} text-white font-medium flex items-center justify-center ring-2 ring-white shrink-0 cursor-pointer`}
      >
        {initialsOf(name)}
      </button>
      {popover}
    </>
  );
}
