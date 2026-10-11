"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "./icons";

/**
 * Search in the navbar on wide screens, where the menu leaves no room for a
 * full box: a button that opens a full-width search field under the bar.
 * Escape, clicking away or navigating closes it, and focus goes back to the
 * button.
 */
export function NavSearch() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="nav-search-panel"
        aria-label="Search"
        className="btn-ghost px-2.5"
      >
        <SearchIcon size={18} />
      </button>
      {open && (
        <div ref={panel} id="nav-search-panel" className="absolute inset-x-0 top-full border-b border-line bg-bg/95 py-3 backdrop-blur">
          <form action="/search" role="search" className="relative mx-auto max-w-3xl px-4 sm:px-6">
            <label htmlFor="nav-q-wide" className="sr-only">
              Search games, PSN IDs, guides
            </label>
            <SearchIcon size={18} className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-faint sm:left-9" />
            <input id="nav-q-wide" name="q" placeholder="Search games, PSN IDs, guides…" className="input py-2.5 pl-10 text-[15px]" />
          </form>
        </div>
      )}
    </>
  );
}
