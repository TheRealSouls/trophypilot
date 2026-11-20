"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { TrophyIcon } from "./TrophyIcon";
import { CheckIcon, SyncIcon } from "./icons";

/**
 * The sign-up page's steps, with a short animated demo under them: a pretend
 * TrophyPilot window where a cursor makes an account, links PSN, syncs and
 * earns a trophy. The step it's showing is highlighted in the list. It's all
 * drawn in the page (no video), pauses on request, and people who ask for
 * less motion get still pictures they move through with the step buttons.
 */

type Key = { at: number; x: number; y: number; click?: boolean };

/** Where the cursor goes in each scene (percent of the window), and when (ms). */
const SCENES: { length: number; keys: Key[] }[] = [
  {
    length: 6600,
    keys: [
      { at: 0, x: 85, y: 90 },
      { at: 500, x: 45, y: 38 },
      { at: 1100, x: 45, y: 38, click: true },
      { at: 2600, x: 45, y: 56 },
      { at: 3100, x: 45, y: 56, click: true },
      { at: 4300, x: 50, y: 77 },
      { at: 4900, x: 50, y: 77, click: true },
    ],
  },
  {
    length: 7000,
    keys: [
      { at: 0, x: 50, y: 85 },
      { at: 400, x: 45, y: 38 },
      { at: 900, x: 45, y: 38, click: true },
      { at: 2700, x: 82, y: 56 },
      { at: 3300, x: 82, y: 56, click: true },
      { at: 4300, x: 50, y: 82 },
      { at: 4900, x: 50, y: 82, click: true },
    ],
  },
  {
    length: 6200,
    keys: [
      { at: 0, x: 30, y: 85 },
      { at: 500, x: 50, y: 44 },
      { at: 1100, x: 50, y: 44, click: true },
      { at: 4200, x: 80, y: 88 },
    ],
  },
  {
    length: 6800,
    keys: [
      { at: 0, x: 80, y: 90 },
      { at: 600, x: 60, y: 53 },
      { at: 1200, x: 60, y: 53, click: true },
      { at: 2600, x: 60, y: 65 },
      { at: 3200, x: 60, y: 65, click: true },
      { at: 4800, x: 85, y: 88 },
    ],
  },
];

const CLICK_MS = 280;
const typed = (text: string, start: number, t: number, speed = 110) => text.slice(0, Math.max(0, Math.min(text.length, Math.floor((t - start) / speed))));
const ramp = (start: number, end: number, t: number) => Math.max(0, Math.min(1, (t - start) / (end - start)));

export function StepsWithDemo({ steps }: { steps: [string, string][] }) {
  const [scene, setScene] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [still, setStill] = useState(false);

  // Plays by itself unless the visitor asked for less motion.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduce);
    setPlaying(!reduce);
    // Still pictures show each scene's end.
    if (reduce) setT(SCENES[0].length);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((prev) => prev + 50), 50);
    return () => clearInterval(id);
  }, [playing]);

  // At the end of a scene, on to the next (and round again after the last).
  useEffect(() => {
    if (!playing || t < SCENES[scene].length) return;
    setScene((s) => (s + 1) % SCENES.length);
    setT(0);
  }, [playing, t, scene]);

  const go = (i: number) => {
    setScene(i);
    setT(still ? SCENES[i].length : 0);
  };

  const keys = SCENES[scene].keys;
  const key = [...keys].reverse().find((k) => k.at <= t) ?? keys[0];
  const clicking = keys.some((k) => k.click && t >= k.at && t < k.at + CLICK_MS);

  return (
    <div className="space-y-6">
      <ol className="divide-y divide-line border-y border-line">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-4 py-4">
            <span className={clsx("w-6 shrink-0 text-sm font-bold", i === scene ? "text-accent-text" : "text-faint")}>{String(i + 1).padStart(2, "0")}</span>
            <div>
              <div className={clsx("text-sm font-semibold", i !== scene && "text-muted")}>{title}</div>
              <p className="text-sm text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <figure>
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-raised)]">
          {/* Window bar */}
          <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-3 py-2" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-line-strong/40" />
            <span className="ml-2 flex-1 truncate rounded-md bg-surface px-2 py-0.5 text-[11px] text-faint">trophypilot.com{["/register", "/settings", "/settings", "/games/ashen-crown"][scene]}</span>
          </div>
          <div className="relative aspect-[16/11] select-none overflow-hidden" aria-hidden>
            {scene === 0 && <SceneAccount t={t} />}
            {scene === 1 && <SceneLink t={t} />}
            {scene === 2 && <SceneSync t={t} />}
            {scene === 3 && <SceneHunt t={t} />}
            {!still && (
              <span
                className="pointer-events-none absolute z-10 transition-[left,top] duration-500 ease-in-out"
                style={{ left: `${key.x}%`, top: `${key.y}%` }}
              >
                {clicking && <span className="demo-click absolute -left-3 -top-3 h-6 w-6 rounded-full bg-accent/40" />}
                <svg width="20" height="22" viewBox="0 0 20 22" className={clsx("drop-shadow transition-transform", clicking && "scale-90")}>
                  <path d="M2 1.5v16.5l4.6-4.2 3 6.7 3-1.4-3-6.6h6.2z" fill="#12151b" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </div>
        </div>
        <figcaption className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="mr-auto">How it works, in four steps.</span>
          {SCENES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show step ${i + 1}: ${steps[i][0]}`}
              aria-current={i === scene ? "step" : undefined}
              className={clsx("h-7 w-7 rounded-full border text-xs font-semibold", i === scene ? "border-accent bg-accent text-white" : "border-line-strong text-muted hover:text-text")}
            >
              {i + 1}
            </button>
          ))}
          {!still && (
            <button type="button" onClick={() => setPlaying((p) => !p)} className="chip min-h-7 px-3 hover:text-text">
              {playing ? "Pause" : "Play"}
            </button>
          )}
        </figcaption>
      </figure>
    </div>
  );
}

/* ─── The four scenes, drawn from the time t into the scene ─────────────────── */

function Field({ label, value, focused, top }: { label: string; value: string; focused: boolean; top: string }) {
  return (
    <div className="absolute left-[10%] right-[10%]" style={{ top }}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={clsx("flex h-8 items-center rounded-md border bg-surface px-2 text-xs", focused ? "border-accent ring-2 ring-accent/20" : "border-line-strong/60")}>
        {value}
        {focused && <span className="demo-caret ml-px h-3.5 w-px bg-text" />}
      </div>
    </div>
  );
}

function Button({ children, top, pressed, done }: { children: React.ReactNode; top: string; pressed?: boolean; done?: boolean }) {
  return (
    <div
      className={clsx(
        "absolute left-[10%] right-[10%] flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-white transition-colors",
        done ? "bg-good" : pressed ? "bg-accent-hi" : "bg-accent",
      )}
      style={{ top }}
    >
      {children}
    </div>
  );
}

function SceneAccount({ t }: { t: number }) {
  const created = t > 5100;
  return (
    <div className="absolute inset-0 bg-surface">
      <div className="absolute left-[10%] top-[10%] text-sm font-bold">Create your account</div>
      <Field label="Username" value={typed("TrophyFan", 1200, t)} focused={t > 1100 && t < 3100} top="27%" />
      <Field label="Password" value={"•".repeat(typed("12345678", 3200, t, 90).length)} focused={t > 3100 && t < 4900} top="45%" />
      <Button top="72%" pressed={t > 4900 && t < 5100} done={created}>
        {created ? (
          <>
            <CheckIcon size={13} /> Account made
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </div>
  );
}

function SceneLink({ t }: { t: number }) {
  const copied = t > 3300;
  const verified = t > 5000;
  return (
    <div className="absolute inset-0 bg-surface">
      <div className="absolute left-[10%] top-[10%] text-sm font-bold">Link your PSN Online ID</div>
      <Field label="PSN Online ID" value={typed("TrophyFan_PS", 1000, t, 100)} focused={t > 900 && t < 2600} top="27%" />
      <div className={clsx("absolute left-[10%] right-[10%] top-[52%] flex items-center gap-2 rounded-md border border-dashed border-line-strong/60 bg-surface-2 px-2 py-1.5 transition-opacity", t > 2300 ? "opacity-100" : "opacity-0")}>
        <span className="text-[10px] text-muted">Put this in your PSN About Me:</span>
        <span className="font-mono text-xs font-bold">TP-4821</span>
        <span className={clsx("ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold", copied ? "bg-good/15 text-good" : "bg-surface text-text")}>{copied ? "Copied" : "Copy"}</span>
      </div>
      <Button top="75%" pressed={t > 4900 && t < 5000} done={verified}>
        {verified ? (
          <>
            <CheckIcon size={13} /> PSN verified
          </>
        ) : (
          "Verify"
        )}
      </Button>
    </div>
  );
}

function SceneSync({ t }: { t: number }) {
  const p = ramp(1300, 3900, t);
  const done = p >= 1;
  return (
    <div className="absolute inset-0 bg-surface">
      <div className="absolute left-[10%] top-[10%] text-sm font-bold">Your trophies</div>
      <div className="absolute left-[10%] right-[10%] top-[22%] flex items-center gap-2 text-xs text-muted">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-plat/20 text-[10px] font-bold text-plat">TF</span>
        TrophyFan_PS · verified
      </div>
      <Button top="37%" pressed={t > 1100 && t < 1300} done={done}>
        {done ? <CheckIcon size={13} /> : <SyncIcon size={13} className={t > 1100 ? "animate-spin" : undefined} />}
        {done ? "Up to date" : t > 1100 ? "Syncing…" : "Sync my trophies"}
      </Button>
      <div className="absolute left-[10%] right-[10%] top-[58%]">
        <div className="h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent" style={{ width: `${p * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["Games", Math.round(p * 128)],
              ["Trophies", Math.round(p * 3412)],
              ["Platinums", Math.round(p * 21)],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="rounded-md border border-line py-1.5">
              <div className="text-sm font-bold tabular-nums">{n.toLocaleString("en-GB")}</div>
              <div className="text-[10px] text-muted">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneHunt({ t }: { t: number }) {
  const first = t > 1250;
  const second = t > 3250;
  const pct = 45 + (first ? 8 : 0) + (second ? 9 : 0);
  const rows: { name: string; note: string; type: string; earned: boolean; missable?: boolean }[] = [
    { name: "First Flame", note: "Light the first beacon.", type: "BRONZE", earned: true },
    { name: "Lost Relic", note: "Missable: before chapter 3.", type: "GOLD", earned: first, missable: true },
    { name: "Warden's Fall", note: "Defeat the Frost Warden.", type: "SILVER", earned: second },
  ];
  return (
    <div className="absolute inset-0 bg-surface">
      <div className="absolute left-[6%] right-[6%] top-[8%] rounded-md bg-surface-2 px-2 py-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          Base game <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="absolute left-[6%] right-[6%] top-[30%] divide-y divide-line overflow-hidden rounded-md border border-line">
        {rows.map((r) => (
          <li key={r.name} className={clsx("flex items-center gap-2 px-2 py-1.5 transition-colors duration-500", r.earned ? "bg-accent/[0.07]" : "bg-surface")}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{r.name}</div>
              <div className={clsx("truncate text-[10px]", r.missable ? "text-bad" : "text-muted")}>{r.note}</div>
            </div>
            <span className={clsx("rounded border px-1.5 py-0.5 text-[10px]", r.earned ? "border-accent/40 font-semibold text-accent-text" : "border-line text-muted")}>
              {r.earned ? "Earned" : "Not earned"}
            </span>
            <span className={clsx("relative flex items-center justify-center", r.earned && "medal-glow")}>
              <TrophyIcon type={r.type} size={20} dim={!r.earned} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
