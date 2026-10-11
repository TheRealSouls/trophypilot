"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { syncNow } from "@/actions/account";
import { useMe } from "./session";
import { SyncIcon } from "./icons";

type Job = { status: string; gamesSynced: number; trophiesSynced: number; remaining: number; error: string | null; startedAt: string };

/**
 * "Sync my trophies" in the top bar, for members with PSN linked. It answers
 * at once (the sync runs on the server in the background) and then follows
 * the sync every couple of seconds until it's done, showing the result
 * underneath. Same once-an-hour limit as Settings.
 */
export function SyncMyTrophies() {
  const [state, action, pending] = useActionState(syncNow, null);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const router = useRouter();
  const { reload } = useMe();
  const startedAt = useRef(0);

  // Errors (cooldown, already running) show straight away; a started sync gets followed.
  useEffect(() => {
    if (!state) return;
    if (state.error) {
      setMessage({ text: state.error, bad: true });
      return;
    }
    startedAt.current = Date.now();
    setRunning(true);
    setMessage({ text: "Syncing your trophies…" });
  }, [state]);

  useEffect(() => {
    if (!running) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        const { job } = (await res.json()) as { job: Job | null };
        // Only a job from this click counts (with a little slack for clock differences).
        if (stop || !job || new Date(job.startedAt).getTime() < startedAt.current - 30_000) return;
        if (job.status === "FAILED") {
          setRunning(false);
          setMessage({ text: job.error ? `Sync failed: ${job.error}` : "Sync failed. Try again in a minute.", bad: true });
          return;
        }
        if (job.status === "RUNNING" || job.remaining > 0) {
          setMessage({ text: job.remaining ? `Importing your library: ${job.remaining} games to go…` : "Syncing your trophies…" });
          return;
        }
        setRunning(false);
        setMessage({
          text:
            job.gamesSynced === 0
              ? "Already up to date."
              : job.trophiesSynced
                ? `Synced ${job.trophiesSynced} new trophies across ${job.gamesSynced} games.`
                : `Checked ${job.gamesSynced} games, no new trophies.`,
        });
        router.refresh();
        void reload();
      } catch {
        // Try again on the next tick.
      }
    };
    const t = setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [running, router, reload]);

  // The result stays up for a few seconds once the sync is over.
  useEffect(() => {
    if (!message || running) return;
    const t = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(t);
  }, [message, running]);

  const busy = pending || running;
  return (
    <form action={action} className="relative">
      <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary px-3 py-2" title="Sync my trophies">
        <SyncIcon size={16} className={busy ? "animate-spin" : undefined} />
        <span className="hidden xl:inline">{busy ? "Syncing…" : "Sync my trophies"}</span>
        <span className="sr-only xl:hidden">{busy ? "Syncing" : "Sync my trophies"}</span>
      </button>
      <p
        role={message?.bad ? "alert" : "status"}
        className={
          message
            ? `absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border bg-surface px-3 py-2 text-sm shadow-[var(--shadow-raised)] ${message.bad ? "border-bad/50 text-bad" : "border-good/50 text-good"}`
            : "sr-only"
        }
      >
        {message?.text ?? ""}
      </p>
    </form>
  );
}
