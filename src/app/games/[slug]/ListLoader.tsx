"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CubeLoader } from "@/components/CubeLoader";

/**
 * Shown where the trophy list goes when we don't have it yet: fetches it from
 * PlayStation Network in the background (the rest of the page is already up),
 * then refreshes the page to show it.
 */
export function ListLoader({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/trophies`, { cache: "no-store" });
      const data = (await res.json()) as { trophies?: unknown[]; error?: string | null };
      if (data.error) setError(data.error);
      else if (!data.trophies?.length) setError("PlayStation Network has no trophy list for this game yet.");
      else router.refresh();
    } catch {
      setError("We couldn't reach PlayStation Network. Try again in a moment.");
    }
  }, [gameId, router]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error)
    return (
      <div className="card p-5 text-sm" role="alert">
        <p className="text-bad">{error}</p>
        <button type="button" onClick={() => void load()} className="btn-ghost mt-3">
          Try again
        </button>
      </div>
    );
  return (
    <div className="card" role="status" aria-live="polite">
      <CubeLoader label="Fetching the trophy list from PlayStation Network" />
    </div>
  );
}
