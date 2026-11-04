"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { setReaction } from "@/actions/reactions";
import { REACTIONS } from "@/lib/reaction-emojis";
import type { ReactionCount, ReactionKind } from "@/lib/reactions";

const NAMES: Record<string, string> = Object.fromEntries(REACTIONS);

/**
 * Emoji reactions under an update, a comment or a forum reply. A tap shows
 * straight away; the server is told the end result (on or off), one request
 * at a time per emoji, so quick taps and slow connections can't double up.
 */
export function ReactionBar({ kind, id, initial, signedIn, small = false }: { kind: ReactionKind; id: string; initial: ReactionCount[]; signedIn: boolean; small?: boolean }) {
  const [counts, setCounts] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  // Per emoji: what the server last confirmed, and whether a request is on its way.
  const confirmed = useRef(new Map(initial.map((c) => [c.emoji, c.mine])));
  const busy = useRef(new Set<string>());
  // The latest tap per emoji, which the request loop catches up to.
  const latest = useRef(new Map<string, boolean>());

  const sync = async (emoji: string, want: boolean) => {
    if (busy.current.has(emoji)) return;
    busy.current.add(emoji);
    try {
      let target = want;
      // Keep sending until the server matches the latest tap.
      while (confirmed.current.get(emoji) !== target) {
        const res = await setReaction(kind, id, emoji, target).catch(() => ({ ok: false as const, error: "Couldn't save that. Check your connection." }));
        if (!res.ok) {
          setError(res.error);
          // Put the count back to what the server has.
          const real = confirmed.current.get(emoji) ?? false;
          setCounts((cs) => cs.map((c) => (c.emoji === emoji && c.mine !== real ? { ...c, mine: real, n: c.n + (real ? 1 : -1) } : c)));
          break;
        }
        confirmed.current.set(emoji, target);
        target = latest.current.get(emoji) ?? target;
      }
    } finally {
      busy.current.delete(emoji);
    }
  };

  const tap = (emoji: string) => {
    if (!signedIn) return;
    setError("");
    const now = counts.find((c) => c.emoji === emoji);
    const want = !now?.mine;
    latest.current.set(emoji, want);
    setCounts((cs) => cs.map((c) => (c.emoji === emoji ? { ...c, mine: want, n: Math.max(0, c.n + (want ? 1 : -1)) } : c)));
    setOpen(false);
    void sync(emoji, want);
  };

  const used = counts.filter((c) => c.n > 0);
  if (!signedIn && !used.length) return null;
  const chip = small ? "h-6 px-1.5 text-xs" : "h-7 px-2 text-sm";
  return (
    <div className={clsx("flex flex-wrap items-center gap-1.5", small ? "mt-1" : "mt-2")}>
      {used.map((c) => (
        <button
          key={c.emoji}
          type="button"
          onClick={() => tap(c.emoji)}
          disabled={!signedIn}
          aria-pressed={c.mine}
          aria-label={`${NAMES[c.emoji]}, ${c.n} reaction${c.n === 1 ? "" : "s"}${c.mine ? ", including yours" : ""}`}
          className={clsx(
            "inline-flex min-w-6 items-center gap-1 rounded-full border disabled:cursor-default",
            chip,
            c.mine ? "border-accent-text/60 bg-accent/10" : "border-line bg-surface-2 hover:border-line-strong",
          )}
        >
          <span aria-hidden>{c.emoji}</span>
          <span className="text-xs font-semibold tabular-nums">{c.n}</span>
        </button>
      ))}
      {signedIn && (
        <>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className={clsx("inline-flex min-w-6 items-center gap-1 rounded-full border border-line text-muted hover:text-text", chip)}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden>
              <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="7.5" cy="8.5" r="1" fill="currentColor" />
              <circle cx="12.5" cy="8.5" r="1" fill="currentColor" />
              <path d="M6.8 12a3.6 3.6 0 0 0 6.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="text-xs">React</span>
          </button>
          {open && (
            <div className="flex flex-wrap gap-0.5 rounded-full border border-line bg-surface p-0.5" role="group" aria-label="Pick a reaction">
              {counts.map((c) => (
                <button
                  key={c.emoji}
                  type="button"
                  onClick={() => tap(c.emoji)}
                  aria-pressed={c.mine}
                  aria-label={NAMES[c.emoji]}
                  title={NAMES[c.emoji]}
                  className={clsx("flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-surface-2", c.mine && "bg-accent/10")}
                >
                  <span aria-hidden>{c.emoji}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {error && (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      )}
    </div>
  );
}
