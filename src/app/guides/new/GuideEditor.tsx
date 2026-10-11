"use client";

import { useEffect, useState } from "react";
import { createGuide } from "@/actions/community";
import { SubmitButton, useKeepValuesAction } from "@/components/client";
import { FormMessage } from "@/components/ui";
import { GamePicker, type PickedGame } from "@/components/GamePicker";
import { RichTextArea } from "@/components/RichTextArea";

type TrophyOption = { id: string; name: string; description: string; type: string; hidden: boolean };
type Step = { key: number; kind: string; title: string; body: string; trophyId: string; video: string };

const KINDS = [
  ["ROADMAP", "Roadmap stage"],
  ["MISSABLE", "Missable"],
  ["COLLECTIBLE", "Collectible"],
  ["SPEEDRUN", "Speedrun split"],
];

let nextKey = 1;
const blank = (kind = "ROADMAP"): Step => ({ key: nextKey++, kind, title: "", body: "", trophyId: "", video: "" });

export function GuideEditor({ initialGame }: { initialGame?: PickedGame | null }) {
  const [state, form, pending] = useKeepValuesAction(createGuide, null);
  const [game, setGame] = useState<PickedGame | null>(initialGame ?? null);
  const [trophies, setTrophies] = useState<TrophyOption[]>([]);
  const [trophyNote, setTrophyNote] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([blank()]);
  // How to earn each trophy, keyed by trophy id. Blank ones are left out of the guide.
  const [notes, setNotes] = useState<Record<string, string>>({});

  // Trophies of the chosen list, for linking steps. PSN-imported games load their list on first use.
  useEffect(() => {
    setTrophies([]);
    setTrophyNote(null);
    setSteps((s) => s.map((x) => ({ ...x, trophyId: "" })));
    setNotes({});
    if (!game) return;
    const ctrl = new AbortController();
    setTrophyNote("Loading trophies…");
    fetch(`/api/games/${game.id}/trophies`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { trophies: TrophyOption[]; error: string | null }) => {
        setTrophies(d.trophies ?? []);
        setTrophyNote(d.error ?? (d.trophies?.length ? null : "No trophy list for this game yet."));
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [game]);

  const update = (key: number, patch: Partial<Step>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  return (
    <form {...form} className="space-y-6">
      <section className="card space-y-4 p-6">
        <GamePicker name="gameId" initial={initialGame} onChange={setGame} required />
        {trophyNote && <p className="-mt-2 text-xs text-muted">{trophyNote}</p>}
        <div>
          <label htmlFor="title" className="label">
            Guide title
          </label>
          <input
            id="title"
            name="title"
            required
            minLength={5}
            maxLength={120}
            className="input"
            placeholder={game ? `${game.title} trophy guide and roadmap` : ""}
          />
        </div>
        <div>
          <label htmlFor="summary" className="label">
            Summary
          </label>
          <RichTextArea
            id="summary"
            name="summary"
            required
            minLength={20}
            maxLength={600}
            rows={3}
            className="input"
            placeholder="Overview, what to expect, key warnings."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="difficulty" className="label">
              Difficulty (1 to 10)
            </label>
            <input id="difficulty" name="difficulty" type="number" min={1} max={10} defaultValue={5} required className="input" />
          </div>
          <div>
            <label htmlFor="hoursEstimate" className="label">
              Hours to plat
            </label>
            <input id="hoursEstimate" name="hoursEstimate" type="number" min={1} defaultValue={20} required className="input" />
          </div>
          <div>
            <label htmlFor="playthroughs" className="label">
              Playthroughs
            </label>
            <input
              id="playthroughs"
              name="playthroughs"
              type="number"
              min={1}
              max={20}
              defaultValue={1}
              required
              className="input"
            />
          </div>
        </div>
        <div>
          <label htmlFor="video" className="label">
            Video walkthrough (YouTube URL, optional)
          </label>
          <input id="video" name="video" className="input" placeholder="https://youtu.be/…" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="onlineRequired" className="accent-[var(--color-accent)]" /> Online trophies required
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Roadmap and steps</h2>
        <p className="text-sm text-muted">The big picture: the order to do things in, what can be missed, where the collectibles are.</p>
        {steps.map((s, i) => (
          <fieldset key={s.key} className="card space-y-3 p-5">
            <legend className="sr-only">Step {i + 1}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-muted">#{i + 1}</span>
              <select
                value={s.kind}
                onChange={(e) => update(s.key, { kind: e.target.value })}
                className="input w-auto py-1.5"
                aria-label="Step type"
              >
                {KINDS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <div className="ml-auto flex gap-1">
                <button type="button" onClick={() => move(i, -1)} className="btn-ghost px-2.5 py-1 text-xs">
                  Up
                </button>
                <button type="button" onClick={() => move(i, 1)} className="btn-ghost px-2.5 py-1 text-xs">
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => setSteps((x) => (x.length > 1 ? x.filter((y) => y.key !== s.key) : x))}
                  className="btn-ghost px-2.5 py-1 text-xs text-bad"
                >
                  Remove
                </button>
              </div>
            </div>
            <input
              value={s.title}
              onChange={(e) => update(s.key, { title: e.target.value })}
              placeholder="Step title"
              className="input"
              aria-label="Step title"
            />
            <RichTextArea
              value={s.body}
              onChange={(e) => update(s.key, { body: e.target.value })}
              rows={4}
              placeholder="What to do…"
              className="input"
              aria-label="Step details"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={s.trophyId}
                onChange={(e) => update(s.key, { trophyId: e.target.value })}
                className="input"
                aria-label="Linked trophy"
                disabled={!game || trophies.length === 0}
              >
                <option value="">
                  {!game ? "Pick a game first" : trophies.length ? "Link a trophy (optional)" : "No trophies to link"}
                </option>
                {trophies.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.type.toLowerCase()} · {t.name}
                    {t.hidden ? " (hidden)" : ""}
                  </option>
                ))}
              </select>
              <input
                value={s.video}
                onChange={(e) => update(s.key, { video: e.target.value })}
                placeholder="YouTube URL (optional)"
                className="input"
                aria-label="Step video"
              />
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSteps((s) => [...s, blank(k)])} className="btn-ghost">
              + {l}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Trophy by trophy</h2>
        {trophies.length === 0 ? (
          <p className="text-sm text-muted">{game ? (trophyNote ?? "No trophy list for this game yet.") : "Pick a game above and its trophies are listed here."}</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Optional. Say how to earn each trophy: where, when, and any trick to it. Leave one blank and it&apos;s left out of the guide.
              {" "}
              {Object.values(notes).filter((n) => n.trim()).length} of {trophies.length} written.
            </p>
            <ul className="card divide-y divide-line">
              {trophies.map((t) => (
                <li key={t.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,280px)_1fr]">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {t.name}
                      {t.hidden && <span className="ml-2 chip">Hidden</span>}
                    </div>
                    <div className="text-xs capitalize text-muted">{t.type.toLowerCase()}</div>
                    <div className="mt-1 text-xs text-muted">{t.description}</div>
                  </div>
                  <RichTextArea
                    value={notes[t.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                    rows={3}
                    maxLength={4000}
                    placeholder="How to earn it…"
                    className="input"
                    aria-label={`How to earn ${t.name}`}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <input
        type="hidden"
        name="steps"
        value={JSON.stringify([
          // A roadmap step left completely empty is dropped, so a trophy-by-trophy guide doesn't need one.
          ...steps
            .filter((s) => s.title.trim() || s.body.trim())
            .map(({ kind, title, body, trophyId, video }) => ({
              kind,
              title,
              body,
              trophyId: trophyId || null,
              video: video || null,
            })),
          ...trophies
            .filter((t) => (notes[t.id] ?? "").trim())
            .map((t) => ({ kind: "TROPHY", title: t.name, body: notes[t.id].trim(), trophyId: t.id, video: null })),
        ])}
      />
      <FormMessage state={state} />
      <SubmitButton className="btn-primary px-6 py-3" pending={pending} pendingText="Publishing…">
        Publish guide
      </SubmitButton>
    </form>
  );
}
