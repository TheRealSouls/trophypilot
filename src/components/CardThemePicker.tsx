"use client";

import { useState } from "react";
import clsx from "clsx";
import { PROFILE_CARDS, cardClass } from "@/lib/profile-themes";
import { ProfileCardArt } from "./ProfileCardArt";

/**
 * Pick one of the card themes (the same ones as profile cards). A radio group
 * of small previews; the choice is sent as `name`.
 */
export function CardThemePicker({ name = "theme", value = "", legend = "Theme", onPick }: { name?: string; value?: string; legend?: string; onPick?: (v: string) => void }) {
  const [picked, setPicked] = useState(value);
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(PROFILE_CARDS).map(([key, c]) => (
          <label key={key || "plain"} className="relative block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={key}
              checked={picked === key}
              onChange={() => {
                setPicked(key);
                onPick?.(key);
              }}
              className="peer sr-only"
            />
            <span
              className={clsx(
                "block overflow-hidden rounded-lg border-2 transition-colors",
                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text",
                picked === key ? "border-accent" : "border-line hover:border-line-strong",
              )}
            >
              <span className={clsx("relative block h-10 bg-surface-3", cardClass(key))} aria-hidden>
                <ProfileCardArt card={key} part="banner" />
              </span>
              <span className="block px-2 py-1 text-xs font-semibold">{c.name}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
