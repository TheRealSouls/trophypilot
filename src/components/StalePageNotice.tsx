"use client";

import { useEffect, useState } from "react";

/** The error Next.js gives when a button on an old page points at code a newer deploy replaced. */
export const isStaleActionError = (e: unknown) => /Server Action .*(not found|was not found)|Failed to find Server Action/i.test(String((e as Error)?.message ?? e));

/**
 * After a site update, buttons on a page opened before it stop working
 * (their server code moved). This notices that and asks for a refresh,
 * instead of the click silently doing nothing.
 */
export function StalePageNotice() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const onError = (e: ErrorEvent) => isStaleActionError(e.error ?? e.message) && setStale(true);
    const onRejection = (e: PromiseRejectionEvent) => isStaleActionError(e.reason) && setStale(true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  if (!stale) return null;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-[var(--shadow-raised)]">
      <span className="flex-1">TrophyPilot was updated since you opened this page, so that didn&apos;t go through. Refresh to carry on.</span>
      <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  );
}
