"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** The "…" between page numbers: type a page and press Enter to go there. */
export function PageJump({ pages, template, mark }: { pages: number; template: string; mark: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const go = () => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 1) return;
    router.push(template.replace(mark, String(Math.min(n, pages))));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="inline-flex"
    >
      <label className="sr-only" htmlFor={`jump-${template.length}`}>
        Go to page (1 to {pages})
      </label>
      <input
        id={`jump-${template.length}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={pages}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value && go()}
        placeholder="…"
        title={`Type a page from 1 to ${pages} and press Enter`}
        className="h-9 w-14 rounded-lg border border-dashed border-line-strong bg-surface px-1 text-center text-sm tabular-nums placeholder:text-muted [appearance:textfield] focus:border-accent focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </form>
  );
}
