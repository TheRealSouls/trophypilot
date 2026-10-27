"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Tabs inside a home page panel: the panels are rendered on the server and
 * only shown or hidden here. Follows the ARIA tabs pattern (arrow keys, Home
 * and End move between tabs).
 */
export function Tabs({ tabs, label }: { tabs: { key: string; label: string; content: ReactNode }[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focus = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    setActive(tabs[n].key);
    refs.current[n]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-1 flex gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`${id}-panel-${t.key}`}
            tabIndex={active === t.key ? 0 : -1}
            onClick={() => setActive(t.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") focus(i + 1);
              else if (e.key === "ArrowLeft") focus(i - 1);
              else if (e.key === "Home") focus(0);
              else if (e.key === "End") focus(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={clsx(
              "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold",
              active === t.key ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-surface hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`${id}-panel-${t.key}`} aria-labelledby={`${id}-tab-${t.key}`} hidden={active !== t.key} tabIndex={0} className="outline-none">
          {t.content}
        </div>
      ))}
    </div>
  );
}
