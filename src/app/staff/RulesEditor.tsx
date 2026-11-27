"use client";

import { useActionState, useId, useState } from "react";
import { saveForumRules, saveGuideRules } from "@/actions/staff";
import { SubmitButton } from "@/components/client";
import { FormMessage } from "@/components/ui";

type Rule = { key: number; title: string; text: string };
let nextKey = 1;

/**
 * The forum or guide rules, one card per rule: change the title or text, add,
 * remove and reorder. Saved as the same text the rules pages read (one block
 * per rule), and every save is logged with what changed and who did it.
 */
export function RulesEditor({ rules, kind = "forum", updated }: { rules: { title: string; text: string }[]; kind?: "forum" | "guide"; updated?: string | null }) {
  const [state, action] = useActionState(kind === "forum" ? saveForumRules : saveGuideRules, null);
  const [list, setList] = useState<Rule[]>(() => rules.map((r) => ({ ...r, key: nextKey++ })));
  const id = useId();
  const set = (key: number, patch: Partial<Rule>) => setList((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) =>
    setList((l) => {
      const j = i + by;
      if (j < 0 || j >= l.length) return l;
      const copy = [...l];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const source = list
    .filter((r) => r.title.trim())
    .map((r) => `${r.title.trim().replace(/\n/g, " ")}\n${r.text.trim().replace(/\n\s*\n/g, "\n")}`.trim())
    .join("\n\n");

  return (
    <form action={action} className="space-y-4">
      <div>
        <h2 className="font-bold">{kind === "forum" ? "Forum rules" : "Guide rules (beside the guide editor)"}</h2>
        <p className="text-xs text-muted">
          Each change is saved to the audit log with your name.{updated ? ` ${updated}` : ""}
        </p>
      </div>
      <input type="hidden" name="rules" value={source} />
      <ol className="space-y-3">
        {list.map((r, i) => (
          <li key={r.key} className="card flex gap-3 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-xs font-bold tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <label className="sr-only" htmlFor={`${id}-t-${r.key}`}>
                Rule {i + 1} title
              </label>
              <input id={`${id}-t-${r.key}`} value={r.title} onChange={(e) => set(r.key, { title: e.target.value })} maxLength={120} placeholder="Rule title" className="input font-semibold" />
              <label className="sr-only" htmlFor={`${id}-x-${r.key}`}>
                Rule {i + 1} explanation
              </label>
              <textarea id={`${id}-x-${r.key}`} value={r.text} onChange={(e) => set(r.key, { text: e.target.value })} rows={2} maxLength={1500} placeholder="What it means (formatting works)" className="input text-sm" />
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="btn-ghost px-2 py-1 text-xs" aria-label={`Move rule ${i + 1} up`}>
                Up
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="btn-ghost px-2 py-1 text-xs" aria-label={`Move rule ${i + 1} down`}>
                Down
              </button>
              <button
                type="button"
                onClick={() => window.confirm(`Remove rule ${i + 1}${r.title ? `, "${r.title}"` : ""}?`) && setList((l) => l.filter((x) => x.key !== r.key))}
                className="btn-ghost px-2 py-1 text-xs text-bad"
                aria-label={`Remove rule ${i + 1}`}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setList((l) => [...l, { key: nextKey++, title: "", text: "" }])} className="btn-ghost">
          Add a rule
        </button>
        <SubmitButton>Save rules</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
