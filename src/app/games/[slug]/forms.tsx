"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import clsx from "clsx";
import { rateGame, setNowPlaying, setUnobtainable } from "@/actions/games";
import { SubmitButton } from "@/components/client";
import { FormMessage } from "@/components/ui";

const DIFFICULTY_WORDS = ["", "Very easy", "Very easy", "Easy", "Easy", "Moderate", "Moderate", "Hard", "Hard", "Very hard", "Brutal"];
const STAR_WORDS = ["", "Poor", "Fair", "Good", "Great", "Outstanding"];

/**
 * A member's own platinum difficulty (1 to 10) and game rating (1 to 5
 * stars). Both are plain radio groups, so arrow keys, Tab and screen readers
 * work as usual: every option has a text label ("7: Hard"), targets are at
 * least 40px tall, the choice is spelled out in words beside each group, and
 * the saved message is announced.
 */
export function RateGameForm({ gameId, difficulty, rating }: { gameId: string; difficulty: number | null; rating: number | null }) {
  const [state, action] = useActionState(rateGame, null);
  const [level, setLevel] = useState(difficulty ?? 0);
  const [stars, setStars] = useState(rating ?? 0);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="gameId" value={gameId} />

      <fieldset aria-describedby="rate-difficulty-now">
        <legend className="label">Platinum difficulty</legend>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <label key={n} className="relative">
              <input
                type="radio"
                name="difficulty"
                value={n}
                checked={level === n}
                onChange={() => setLevel(n)}
                className="peer sr-only"
              />
              <span className="sr-only">
                {n}: {DIFFICULTY_WORDS[n]}
              </span>
              <span
                aria-hidden
                className={clsx(
                  "flex h-10 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold tabular-nums transition-colors",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text",
                  n === level
                    ? "border-accent bg-accent text-white"
                    : n < level
                      ? "border-accent-text/40 bg-accent/10 text-text"
                      : "border-line-strong bg-surface text-text hover:bg-surface-2",
                )}
              >
                {n}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden>
          <span>Very easy</span>
          <span>Brutal</span>
        </div>
        <p id="rate-difficulty-now" className="mt-1 text-sm">
          {level ? (
            <>
              Your pick: <strong>{level}/10, {DIFFICULTY_WORDS[level].toLowerCase()}</strong>{" "}
              <button type="button" onClick={() => setLevel(0)} className="ml-1 text-xs text-muted underline underline-offset-2 hover:text-text">
                Clear difficulty
              </button>
            </>
          ) : (
            <span className="text-muted">Not rated yet.</span>
          )}
        </p>
        {level === 0 && <input type="hidden" name="difficulty" value={0} />}
      </fieldset>

      <fieldset aria-describedby="rate-stars-now">
        <legend className="label">How good is the game?</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} checked={stars === n} onChange={() => setStars(n)} className="peer sr-only" />
              <span className="sr-only">
                {n} star{n === 1 ? "" : "s"}: {STAR_WORDS[n]}
              </span>
              <svg
                width="40"
                height="40"
                viewBox="0 0 20 20"
                aria-hidden
                className={clsx(
                  "rounded-md p-1 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent-text hover:bg-surface-2",
                  n <= stars ? "text-gold" : "text-line-strong",
                )}
              >
                <path
                  d="m10 2 2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L10 14.4 5 17.2l1.2-5.6L2 7.8l5.6-.6L10 2Z"
                  fill={n <= stars ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </label>
          ))}
        </div>
        <p id="rate-stars-now" className="mt-1 text-sm">
          {stars ? (
            <>
              Your pick:{" "}
              <strong>
                {stars} of 5, {STAR_WORDS[stars].toLowerCase()}
              </strong>{" "}
              <button type="button" onClick={() => setStars(0)} className="ml-1 text-xs text-muted underline underline-offset-2 hover:text-text">
                Clear stars
              </button>
            </>
          ) : (
            <span className="text-muted">Not rated yet.</span>
          )}
        </p>
        {/* When no star is picked, send 0 so the rating is cleared. */}
        {stars === 0 && <input type="hidden" name="rating" value={0} />}
      </fieldset>

      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">
        {difficulty || rating ? "Update my rating" : "Save my rating"}
      </SubmitButton>
    </form>
  );
}

/**
 * "I'm playing this now". Flips at once (useOptimistic) while the server
 * saves it; the server only refreshes this game's page and the member's
 * profile, not the whole site.
 */
export function PlayingNowButton({ gameId, playing }: { gameId: string; playing: boolean }) {
  const [shown, setShown] = useOptimistic(playing);
  const [, startTransition] = useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setShown(!shown);
          await setNowPlaying(fd);
        })
      }
      className="mt-5"
    >
      {!shown && <input type="hidden" name="gameId" value={gameId} />}
      <input type="hidden" name="from" value={gameId} />
      <button className={shown ? "btn-primary" : "btn-ghost"} aria-pressed={shown}>
        {shown ? "Playing now · stop" : "I'm playing this now"}
      </button>
    </form>
  );
}

/** Admins: mark the platinum or 100% as no longer obtainable, with the reason. */
export function UnobtainableForm({ gameId, unobtainable, reason }: { gameId: string; unobtainable: string | null; reason: string | null }) {
  const [state, action] = useActionState(setUnobtainable, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="gameId" value={gameId} />
      <div>
        <label htmlFor="unob-status" className="label">
          Can it still be completed?
        </label>
        <select id="unob-status" name="unobtainable" defaultValue={unobtainable ?? ""} className="input">
          <option value="">Yes, everything is obtainable</option>
          <option value="PLATINUM">No: the platinum is unobtainable</option>
          <option value="COMPLETION">Platinum is fine, 100% is unobtainable</option>
        </select>
      </div>
      <div>
        <label htmlFor="unob-reason" className="label">
          Reason
        </label>
        <input
          id="unob-reason"
          name="reason"
          defaultValue={reason ?? ""}
          maxLength={300}
          placeholder="Servers shut down on 1 March 2025"
          className="input"
        />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-ghost w-full" pendingText="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
