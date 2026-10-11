"use client";

import { useState, type ReactNode } from "react";

/** ||spoiler|| text in a post: covered until the reader chooses to reveal it. */
export function InlineSpoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (shown) return <span className="rt-spoiler-shown">{children}</span>;
  return (
    <button type="button" onClick={() => setShown(true)} className="rt-spoiler" aria-label="Spoiler, select to reveal">
      <span aria-hidden>{children}</span>
    </button>
  );
}
