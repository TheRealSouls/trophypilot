"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { publishGuide, saveGuideDraft, type GuideInput } from "@/actions/guides";
import { GamePicker, type PickedGame } from "@/components/GamePicker";
import { RichTextArea } from "@/components/RichTextArea";

type TrophyOption = { id: string; name: string; description: string; type: string; hidden: boolean };
type Step = { key: number; kind: string; title: string; body: string; trophyId: string; video: string };

export type GuideDraft = {
  id: string;
  slug: string;
  status: string;
  game: PickedGame;
  title: string;
  summary: string;
  difficulty: number;
  hoursEstimate: number;
  playthroughs: number;
  video: string;
  onlineRequired: boolean;
  steps: Omit<Step, "key">[];
  /** How to earn each trophy, keyed by trophy id. */
  notes: Record<string, string>;
};

const KINDS = [
  ["ROADMAP", "Roadmap stage"],
  ["MISSABLE", "Missable"],
  ["COLLECTIBLE", "Collectible"],
  ["SPEEDRUN", "Speedrun split"],
];

let nextKey = 1;
const blank = (kind = "ROADMAP"): Step => ({ key: nextKey++, kind, title: "", body: "", trophyId: "", video: "" });

/** How long after the last change a draft saves itself. */
const AUTOSAVE_MS = 2500;

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "error"; message: string } | { kind: "dirty" };

/**
 * The guide editor. Drafts save themselves a couple of seconds after you stop
 * typing, and the bar at the top says so truthfully: Saving, Saved (with the
 * time), or the error with a Retry. Published guides save only when you press
 * Save changes, so half-finished edits never go live.
 */
export function GuideEditor({ initialGame, draft, trusted }: { initialGame?: PickedGame | null; draft?: GuideDraft | null; trusted: boolean }) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(draft?.id ?? null);
  const [slug, setSlug] = useState<string | null>(draft?.slug ?? null);
  const status = draft?.status ?? "DRAFT";
  const live = status === "PUBLISHED" || status === "PENDING";
  const [game, setGame] = useState<PickedGame | null>(draft?.game ?? initialGame ?? null);
  const [title, setTitle] = useState(draft?.title ?? "");
  const [summary, setSummary] = useState(draft?.summary ?? "");
  const [difficulty, setDifficulty] = useState(String(draft?.difficulty ?? 5));
  const [hours, setHours] = useState(String(draft?.hoursEstimate ?? 20));
  const [playthroughs, setPlaythroughs] = useState(String(draft?.playthroughs ?? 1));
  const [video, setVideo] = useState(draft?.video ?? "");
  const [online, setOnline] = useState(draft?.onlineRequired ?? false);
  const [steps, setSteps] = useState<Step[]>(() => (draft?.steps.length ? draft.steps.map((s) => ({ ...s, key: nextKey++ })) : [blank()]));
  const [notes, setNotes] = useState<Record<string, string>>(draft?.notes ?? {});
  const [trophies, setTrophies] = useState<TrophyOption[]>([]);
  const [trophyNote, setTrophyNote] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>(draft ? { kind: "saved", at: new Date() } : { kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [publishing, startPublish] = useTransition();
  const firstGame = useRef(game?.id ?? null);

  // Trophies of the chosen list, for linking steps. Changing the game clears links to the old one's trophies.
  useEffect(() => {
    setTrophies([]);
    setTrophyNote(null);
    if (game?.id !== firstGame.current) {
      setSteps((s) => s.map((x) => ({ ...x, trophyId: "" })));
      setNotes({});
      firstGame.current = game?.id ?? null;
    }
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

  const input: GuideInput = useMemo(
    () => ({
      id,
      gameId: game?.id ?? "",
      title,
      summary,
      difficulty: Number(difficulty),
      hoursEstimate: Number(hours),
      playthroughs: Number(playthroughs),
      video,
      onlineRequired: online,
      steps: [
        ...steps.map(({ kind, title, body, trophyId, video }) => ({ kind, title, body, trophyId: trophyId || null, video: video || null })),
        ...Object.entries(notes)
          .filter(([, n]) => n.trim())
          .map(([trophyId, body]) => ({ kind: "TROPHY", title: "", body: body.trim(), trophyId, video: null })),
      ],
    }),
    [id, game, title, summary, difficulty, hours, playthroughs, video, online, steps, notes],
  );
  // What was last saved, to tell real changes from re-renders.
  const content = JSON.stringify({ ...input, id: null });
  const savedContent = useRef(draft ? content : JSON.stringify({ ...input, id: null }));
  const dirty = content !== savedContent.current;

  const saveNow = useCallback(async () => {
    if (live || !input.gameId) return;
    setSave({ kind: "saving" });
    const snapshot = content;
    const res = await saveGuideDraft(input).catch(() => ({ ok: false as const, error: "Couldn't reach the server." }));
    if (res.ok) {
      savedContent.current = snapshot;
      setId(res.id);
      setSlug(res.slug);
      setSave({ kind: "saved", at: new Date(res.savedAt) });
      // The address follows the draft, so a refresh or the back button finds it again.
      if (!id) window.history.replaceState(null, "", `/guides/${res.slug}/edit`);
    } else {
      setSave({ kind: "error", message: res.error });
    }
  }, [content, input, live, id]);

  // Autosave: a draft saves itself shortly after the last change.
  useEffect(() => {
    if (!dirty) return;
    if (live) {
      setSave({ kind: "dirty" });
      return;
    }
    if (!input.gameId) return;
    const t = setTimeout(saveNow, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [content, dirty, live, input.gameId, saveNow]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const publish = () => {
    setError(null);
    startPublish(async () => {
      const res = await publishGuide(input).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Try again." }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      savedContent.current = content;
      router.push(`/guides/${res.slug}`);
    });
  };

  const update = (key: number, patch: Partial<Step>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  // The checklist beside the editor.
  const written = Object.values(notes).filter((n) => n.trim()).length;
  const checks: [string, boolean, string?][] = [
    ["Game picked", !!game, game?.title],
    ["Title added", title.trim().length >= 5],
    ["Summary written", summary.trim().length >= 20, "At least 20 characters"],
    ["Roadmap stage added", steps.some((s) => s.kind === "ROADMAP" && s.title.trim() && s.body.trim())],
    ["Missables checked", steps.some((s) => s.kind === "MISSABLE" && s.body.trim()), "Mark anything that can be missed"],
    ["Trophies explained", trophies.length > 0 && written >= Math.ceil(trophies.length / 2), trophies.length ? `${written} of ${trophies.length} so far` : undefined],
  ];
  const done = checks.filter(([, ok]) => ok).length;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0 space-y-6">
        {/* Save bar: what's saved, and the actions. */}
        <div className="card sticky top-16 z-20 flex flex-wrap items-center gap-3 p-3">
          <span className={clsx("chip", live ? "border-good/50 text-good" : "")}>{status === "PUBLISHED" ? "Published" : status === "PENDING" ? "Waiting for review" : status === "REJECTED" ? "Sent back" : "Draft"}</span>
          <span className="min-w-0 flex-1 text-sm" aria-live="polite">
            <SaveStatus save={save} live={live} dirty={dirty} hasGame={!!game} />
          </span>
          {!live && (
            <button type="button" onClick={saveNow} disabled={!game || save.kind === "saving"} className="btn-ghost px-3 py-1.5 text-xs">
              Save draft
            </button>
          )}
          {slug && (
            <Link href={`/guides/${slug}`} target="_blank" className="btn-ghost px-3 py-1.5 text-xs">
              Preview
            </Link>
          )}
          <button type="button" onClick={publish} disabled={publishing} className="btn-primary px-3 py-1.5 text-xs">
            {publishing ? "Saving…" : live ? "Save changes" : trusted ? "Publish" : "Submit for review"}
          </button>
        </div>
        {error && (
          <p role="alert" className="border border-bad/50 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}

        <section className="card space-y-4 p-6">
          <GamePicker name="gameId" initial={draft?.game ?? initialGame} onChange={setGame} required />
          {trophyNote && <p className="-mt-2 text-xs text-muted">{trophyNote}</p>}
          <div>
            <label htmlFor="title" className="label">
              Guide title
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="input"
              placeholder={game ? `${game.title} trophy guide and roadmap` : ""}
            />
          </div>
          <div>
            <label htmlFor="summary" className="label">
              Summary
            </label>
            <RichTextArea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={600} rows={3} className="input" placeholder="Overview, what to expect, key warnings." />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="difficulty" className="label">
                Difficulty (1 to 10)
              </label>
              <input id="difficulty" type="number" min={1} max={10} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="hoursEstimate" className="label">
                Hours to plat
              </label>
              <input id="hoursEstimate" type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="playthroughs" className="label">
                Playthroughs
              </label>
              <input id="playthroughs" type="number" min={1} max={20} value={playthroughs} onChange={(e) => setPlaythroughs(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="video" className="label">
              Video walkthrough (YouTube URL, optional)
            </label>
            <input id="video" value={video} onChange={(e) => setVideo(e.target.value)} className="input" placeholder="https://youtu.be/…" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="accent-[var(--color-accent)]" /> Online trophies required
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
                <select value={s.kind} onChange={(e) => update(s.key, { kind: e.target.value })} className="input w-auto py-1.5" aria-label="Step type">
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
                  <button type="button" onClick={() => setSteps((x) => (x.length > 1 ? x.filter((y) => y.key !== s.key) : [blank()]))} className="btn-ghost px-2.5 py-1 text-xs text-bad">
                    Remove
                  </button>
                </div>
              </div>
              <input value={s.title} onChange={(e) => update(s.key, { title: e.target.value })} placeholder="Step title" className="input" aria-label="Step title" />
              <RichTextArea value={s.body} onChange={(e) => update(s.key, { body: e.target.value })} rows={4} placeholder="What to do…" className="input" aria-label="Step details" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={s.trophyId} onChange={(e) => update(s.key, { trophyId: e.target.value })} className="input" aria-label="Linked trophy" disabled={!game || trophies.length === 0}>
                  <option value="">{!game ? "Pick a game first" : trophies.length ? "Link a trophy (optional)" : "No trophies to link"}</option>
                  {trophies.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.type.toLowerCase()} · {t.name}
                      {t.hidden ? " (hidden)" : ""}
                    </option>
                  ))}
                </select>
                <input value={s.video} onChange={(e) => update(s.key, { video: e.target.value })} placeholder="YouTube URL (optional)" className="input" aria-label="Step video" />
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
                Optional. Say how to earn each trophy: where, when, and any trick to it. Leave one blank and it&apos;s left out of the guide. {written} of{" "}
                {trophies.length} written.
              </p>
              <ul className="card divide-y divide-line">
                {trophies.map((t) => (
                  <li key={t.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,280px)_1fr]">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {t.name}
                        {t.hidden && <span className="chip ml-2">Hidden</span>}
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
      </div>

      <aside className="space-y-4 lg:sticky lg:top-16 lg:self-start">
        <section className="card p-5" aria-labelledby="checklist-heading">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="checklist-heading" className="font-bold">
              Guide checklist
            </h2>
            <span className="text-xs text-muted">
              {done} of {checks.length}
            </span>
          </div>
          <div className="mb-3 h-1.5 rounded-full bg-surface-3" aria-hidden>
            <div className="h-1.5 rounded-full bg-good" style={{ width: `${(done / checks.length) * 100}%` }} />
          </div>
          <ul className="space-y-2.5 text-sm">
            {checks.map(([label, ok, detail]) => (
              <li key={label} className="flex gap-2">
                <span aria-hidden className={clsx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]", ok ? "border-good bg-good text-white" : "border-line-strong")}>
                  {ok ? "✓" : ""}
                </span>
                <span>
                  <span className={ok ? "" : "text-muted"}>{label}</span>
                  <span className="sr-only">{ok ? " (done)" : " (not yet)"}</span>
                  {detail && <span className="block text-xs text-muted">{detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5 text-sm">
          <h2 className="mb-1 font-bold">Tips for a great guide</h2>
          <p className="text-muted">
            Cover missables first, then online trophies, collectibles, the time it takes and a clean-up stage. Clear, accurate guides are approved faster.
          </p>
        </section>
      </aside>
    </div>
  );
}

function SaveStatus({ save, live, dirty, hasGame }: { save: SaveState; live: boolean; dirty: boolean; hasGame: boolean }) {
  if (save.kind === "saving") return <span className="text-muted">Saving…</span>;
  if (save.kind === "error")
    return (
      <span className="text-bad">
        Couldn&apos;t save: {save.message} Press Save draft to try again.
      </span>
    );
  if (live) return dirty ? <span className="text-gold">Unsaved changes. Press Save changes to update the guide.</span> : <span className="text-muted">No unsaved changes.</span>;
  if (!hasGame) return <span className="text-muted">Pick a game and the draft saves itself as you write.</span>;
  if (dirty) return <span className="text-muted">Changes not saved yet…</span>;
  if (save.kind === "saved")
    return (
      <span className="text-good">
        All changes saved <span className="text-muted">· {save.at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      </span>
    );
  return <span className="text-muted">Drafts save themselves as you write.</span>;
}
