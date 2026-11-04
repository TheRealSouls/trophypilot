"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { rateGuide } from "@/actions/guides";

/**
 * Rate a guide out of five. Radio buttons underneath, so it works with a
 * keyboard (arrow keys) and screen readers; the stars are how they look.
 */
export function GuideRating({ guideId, mine, avg, count, canRate }: { guideId: string; mine: number; avg: number | null; count: number; canRate: boolean }) {
  const [value, setValue] = useState(mine);
  const [summary, setSummary] = useState({ avg, count });
  const [hover, setHover] = useState(0);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const shown = hover || value;

  const rate = (n: number) => {
    const next = n === value ? 0 : n;
    const before = value;
    setValue(next);
    setError("");
    start(async () => {
      const res = await rateGuide(guideId, next).catch(() => ({ ok: false as const, error: "Couldn't save your rating." }));
      if (res.ok) setSummary({ avg: res.avg, count: res.count });
      else {
        setValue(before);
        setError(res.error);
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {canRate ? (
        <fieldset className="flex items-center" onMouseLeave={() => setHover(0)}>
          <legend className="sr-only">Your rating of this guide</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)} title={`${n} star${n === 1 ? "" : "s"}`}>
              <input
                type="radio"
                name={`rate-${guideId}`}
                value={n}
                checked={value === n}
                onChange={() => rate(n)}
                onClick={() => n === value && rate(n)}
                disabled={pending}
                className="peer sr-only"
              />
              <span className="sr-only">
                {n} star{n === 1 ? "" : "s"}
              </span>
              <svg
                width="24"
                height="24"
                viewBox="0 0 20 20"
                aria-hidden
                className={clsx("rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent-text", n <= shown ? "text-gold" : "text-faint")}
              >
                <path d="M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill={n <= shown ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </label>
          ))}
        </fieldset>
      ) : null}
      <span className="text-sm text-muted" aria-live="polite">
        {summary.count && summary.avg != null
          ? `${summary.avg.toFixed(1)} out of 5 from ${summary.count} rating${summary.count === 1 ? "" : "s"}`
          : canRate
            ? "Be the first to rate it"
            : "No ratings yet"}
        {canRate && value > 0 && ` · you gave ${value}`}
      </span>
      {error && (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      )}
    </div>
  );
}
