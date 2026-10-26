"use client";

import { useEffect } from "react";
import Link from "next/link";
import { isStaleActionError } from "@/components/StalePageNotice";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // A button on a page from before a site update: a refresh fixes it.
  if (isStaleActionError(error)) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <h1 className="text-2xl font-bold">TrophyPilot was updated</h1>
        <p className="mt-3 text-sm text-muted">This page is from before the update, so what you just did didn&apos;t go through. Refresh and try again.</p>
        <div className="mt-6">
          <button onClick={() => window.location.reload()} className="btn-primary">Refresh</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-16">
      <p className="mb-2 text-xs uppercase tracking-widest text-accent-text">Error</p>
      <h1 className="text-2xl font-bold">Something broke on our side</h1>
      <p className="mt-3 text-sm text-muted">
        The page couldn&apos;t load. Trying again usually works. If it keeps happening, let us know and include this reference:{" "}
        <code className="text-text">{error.digest ?? "none"}</code>.
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-ghost">Home</Link>
      </div>
    </div>
  );
}
