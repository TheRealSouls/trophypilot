"use client";

import { useOptimistic, useState, useTransition } from "react";
import clsx from "clsx";
import { voteTip } from "@/actions/community";

/**
 * Up and down votes on a tip. The score changes as soon as you press, then
 * the server saves it; if that fails (for example the page is from before a
 * site update) it goes back and says why.
 */
export function TipVotes({ tipId, score, mine, path, signedIn }: { tipId: string; score: number; mine: number; path: string; signedIn: boolean }) {
  const [state, setOptimistic] = useOptimistic({ score, mine });
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const vote = (value: 1 | -1) => {
    setError("");
    start(async () => {
      // Pressing the same arrow again takes the vote back.
      const next = state.mine === value ? 0 : value;
      setOptimistic({ score: state.score - state.mine + next, mine: next });
      const fd = new FormData();
      fd.set("tipId", tipId);
      fd.set("value", String(value));
      fd.set("path", path);
      try {
        await voteTip(fd);
      } catch {
        setError("Your vote didn't save. Refresh the page and try again.");
      }
    });
  };

  const button = (value: 1 | -1) => (
    <button
      type="button"
      onClick={() => vote(value)}
      disabled={!signedIn || pending}
      aria-label={value === 1 ? "Upvote" : "Downvote"}
      aria-pressed={state.mine === value}
      title={signedIn ? undefined : "Log in to vote"}
      className={clsx(
        "flex h-8 w-8 items-center justify-center rounded-md text-sm disabled:cursor-not-allowed",
        !signedIn && "opacity-40",
        state.mine === value ? (value === 1 ? "bg-good/20 text-good" : "bg-bad/20 text-bad") : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      {value === 1 ? "▲" : "▼"}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-0.5">
      {button(1)}
      <span
        className={clsx("text-sm font-bold tabular-nums", state.score > 0 ? "text-good" : state.score < 0 ? "text-bad" : "text-muted")}
        aria-label={`Score ${state.score}`}
      >
        {state.score}
      </span>
      {button(-1)}
      {error && (
        <p role="alert" className="mt-1 w-24 text-center text-[11px] leading-tight text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
