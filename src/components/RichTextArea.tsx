"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";
import { RichText } from "./RichText";

/**
 * A text box with a formatting toolbar for everything members write: bold,
 * italic, underline, strikethrough, spoilers, text size, quotes, lists,
 * links, YouTube videos and emojis, plus a Preview tab. It writes the same
 * small markdown that RichText shows (lib/rich-text.ts), so the text stays
 * readable as typed. Ctrl+B, Ctrl+I and Ctrl+U work too. It's a normal
 * textarea underneath, so forms and their names work as before.
 */
export const RichTextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function RichTextArea(
  { className, ...props },
  outerRef,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(outerRef, () => ref.current!);
  const [preview, setPreview] = useState<string | null>(null);
  const [menu, setMenu] = useState<"size" | "emoji" | null>(null);
  const label = props["aria-label"] ?? "text";

  // Close menus with Escape or a click elsewhere.
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const el = () => ref.current!;
  /** Sets the value the way typing would, so React forms see the change. */
  const setValue = (next: string, selStart: number, selEnd: number) => {
    const t = el();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(t, next);
    t.dispatchEvent(new Event("input", { bubbles: true }));
    t.focus();
    t.setSelectionRange(selStart, selEnd);
  };
  const wrap = (before: string, after = before, placeholder = "text") => {
    const t = el();
    const { selectionStart: s, selectionEnd: e, value } = t;
    const picked = value.slice(s, e);
    // Already wrapped: take the marks off again.
    if (picked && value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
      setValue(value.slice(0, s - before.length) + picked + value.slice(e + after.length), s - before.length, e - before.length);
      return;
    }
    const inner = picked || placeholder;
    setValue(value.slice(0, s) + before + inner + after + value.slice(e), s + before.length, s + before.length + inner.length);
  };
  /**
   * Rewrites every line the selection touches. Each line reports how much it
   * took off the front (cut) and put on the front (add), so the cursor stays on
   * the same letter instead of the whole line being selected, which made the
   * next key typed replace it (easy to miss on phones).
   */
  const editLines = (fn: (line: string, i: number) => { text: string; cut: number; add: number }) => {
    const t = el();
    const { selectionStart: s, selectionEnd: e, value } = t;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const endNl = value.indexOf("\n", e);
    const end = endNl === -1 ? value.length : endNl;
    const lines = value.slice(start, end).split("\n");
    const out = lines.map(fn);
    const next = out.map((o) => o.text).join("\n");
    // Where a position inside line i of the old text lands in the new text.
    const map = (pos: number) => {
      let oldAt = start;
      let newAt = start;
      for (let i = 0; i < lines.length; i++) {
        if (pos <= oldAt + lines[i].length || i === lines.length - 1) {
          const offset = Math.max(0, pos - oldAt - out[i].cut);
          return newAt + Math.min(out[i].add + offset, out[i].text.length);
        }
        oldAt += lines[i].length + 1;
        newAt += out[i].text.length + 1;
      }
      return newAt;
    };
    const ns = map(s);
    setValue(value.slice(0, start) + next + value.slice(end), ns, s === e ? ns : map(e));
  };
  /** Puts a mark at the start of every selected line (replacing any size or list mark already there). */
  const linePrefix = (prefix: string | ((i: number) => string)) =>
    editLines((l, i) => {
      const old = l.match(/^(#{1,3}|-#|>|[-*•]|\d{1,3}[.)])\s+/)?.[0] ?? "";
      const p = typeof prefix === "function" ? prefix(i) : prefix;
      return { text: p + l.slice(old.length), cut: old.length, add: p.length };
    });
  const insert = (text: string) => {
    const t = el();
    const { selectionStart: s, selectionEnd: e, value } = t;
    setValue(value.slice(0, s) + text + value.slice(e), s + text.length, s + text.length);
  };
  const addLink = () => {
    const url = window.prompt("Link address (https://…)");
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    wrap("[", `](${href})`, "link text");
  };
  const addImage = () => {
    const url = window.prompt("Picture link (https://… ending in .png, .jpg, .gif or .webp)");
    if (!url) return;
    const alt = window.prompt("Describe the picture for people who can't see it (optional)") ?? "";
    const t = el();
    const before = t.value.slice(0, t.selectionStart);
    const pad = before && !before.endsWith("\n") ? "\n" : "";
    insert(`${pad}![${alt.replace(/[\[\]]/g, "")}](${url.trim()})\n`);
  };
  const centre = () => {
    const t = el();
    const { selectionStart: s, selectionEnd: e, value } = t;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const endNl = value.indexOf("\n", e);
    const allCentred = value
      .slice(start, endNl === -1 ? value.length : endNl)
      .split("\n")
      .every((l) => /^->.*<-$/.test(l));
    editLines((l) => {
      if (allCentred) {
        const m = l.match(/^->(\s*)(.*?)\s*<-$/)!;
        return { text: m[2], cut: 2 + m[1].length, add: 0 };
      }
      return l.trim() ? { text: `->${l}<-`, cut: 0, add: 2 } : { text: l, cut: 0, add: 0 };
    });
  };
  const addVideo = () => {
    const url = window.prompt("YouTube link");
    if (!url) return;
    const t = el();
    const { selectionStart: s, value } = t;
    const before = value.slice(0, s);
    const pad = before && !before.endsWith("\n") ? "\n" : "";
    insert(`${pad}${url.trim()}\n`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    props.onKeyDown?.(e);
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "b" || k === "i" || k === "u") {
      e.preventDefault();
      if (k === "b") wrap("**");
      if (k === "i") wrap("*");
      if (k === "u") wrap("__");
    }
  };

  const tool = "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-sm text-muted hover:bg-surface-3 hover:text-text";

  return (
    <div className="rounded-lg border border-line-strong bg-bg focus-within:border-accent-text">
      <div ref={bar} role="toolbar" aria-label={`Formatting for ${label}`} className="relative flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        <button type="button" className={clsx(tool, "font-bold")} onClick={() => wrap("**")} aria-label="Bold (Ctrl+B)" title="Bold (Ctrl+B)">
          B
        </button>
        <button type="button" className={clsx(tool, "italic")} onClick={() => wrap("*")} aria-label="Italic (Ctrl+I)" title="Italic (Ctrl+I)">
          I
        </button>
        <button type="button" className={clsx(tool, "underline")} onClick={() => wrap("__")} aria-label="Underline (Ctrl+U)" title="Underline (Ctrl+U)">
          U
        </button>
        <button type="button" className={clsx(tool, "line-through")} onClick={() => wrap("~~")} aria-label="Strikethrough" title="Strikethrough">
          S
        </button>
        <button type="button" className={tool} onClick={() => wrap("||", "||", "spoiler")} aria-label="Spoiler" title="Spoiler (hidden until clicked)">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M3 17 17 3" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <div className="relative">
          <button
            type="button"
            className={clsx(tool, "gap-1 px-2 text-xs font-semibold")}
            onClick={() => setMenu(menu === "size" ? null : "size")}
            aria-expanded={menu === "size"}
            aria-haspopup="true"
            title="Text size"
          >
            Aa <span aria-hidden>▾</span>
            <span className="sr-only">Text size</span>
          </button>
          {menu === "size" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-line bg-surface py-1 shadow-[var(--shadow-raised)]">
              {(
                [
                  ["# ", "Huge", "text-xl font-bold"],
                  ["## ", "Large", "text-lg font-bold"],
                  ["### ", "Medium", "font-bold"],
                  ["", "Normal", "text-sm"],
                  ["-# ", "Small", "text-xs text-muted"],
                ] as const
              ).map(([p, name, cls]) => (
                <button
                  key={name}
                  type="button"
                  className={clsx("block w-full px-3 py-1.5 text-left hover:bg-surface-2", cls)}
                  onClick={() => {
                    linePrefix(p);
                    setMenu(null);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" className={tool} onClick={centre} aria-label="Centre" title="Centre the line">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <path d="M4 5h12M6.5 8.5h7M4 12h12M6.5 15.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={tool} onClick={() => linePrefix("> ")} aria-label="Quote" title="Quote">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <path d="M4 5v10M8 7h8M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={tool} onClick={() => linePrefix("- ")} aria-label="Bulleted list" title="Bulleted list">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <circle cx="4.5" cy="6" r="1.3" fill="currentColor" />
            <circle cx="4.5" cy="10" r="1.3" fill="currentColor" />
            <circle cx="4.5" cy="14" r="1.3" fill="currentColor" />
            <path d="M8 6h8M8 10h8M8 14h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={tool} onClick={() => linePrefix((i) => `${i + 1}. `)} aria-label="Numbered list" title="Numbered list">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <text x="2" y="8" fontSize="5.5" fill="currentColor" fontWeight="700">1</text>
            <text x="2" y="15" fontSize="5.5" fill="currentColor" fontWeight="700">2</text>
            <path d="M8 6h8M8 13h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button type="button" className={tool} onClick={addLink} aria-label="Link" title="Link">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={tool} onClick={addImage} aria-label="Picture (link)" title="Picture from a link">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <rect x="2.5" y="4" width="15" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="7" cy="8.2" r="1.4" fill="currentColor" />
            <path d="m3.5 14.5 4.5-4 3 2.5 2.5-2 3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className={tool} onClick={addVideo} aria-label="YouTube video" title="YouTube video">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
            <rect x="2.5" y="4.5" width="15" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="m8.5 7.5 4 2.5-4 2.5z" fill="currentColor" />
          </svg>
        </button>
        <div className="relative">
          <button
            type="button"
            className={tool}
            onClick={() => setMenu(menu === "emoji" ? null : "emoji")}
            aria-expanded={menu === "emoji"}
            aria-haspopup="true"
            aria-label="Emoji"
            title="Emoji"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
              <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="7.5" cy="8.5" r="1" fill="currentColor" />
              <circle cx="12.5" cy="8.5" r="1" fill="currentColor" />
              <path d="M6.8 12a3.6 3.6 0 0 0 6.4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          {menu === "emoji" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[85vw] rounded-lg border border-line bg-surface p-2 shadow-[var(--shadow-raised)] sm:left-auto sm:right-0">
              {EMOJIS.map(([group, list]) => (
                <div key={group} className="mb-1.5">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{group}</p>
                  <div className="grid grid-cols-8">
                    {list.map(([e, name]) => (
                      <button
                        key={e}
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-surface-2"
                        onClick={() => {
                          insert(e);
                          setMenu(null);
                        }}
                        aria-label={name}
                        title={name}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPreview(preview === null ? (ref.current?.value ?? "") : null)}
          aria-pressed={preview !== null}
          className={clsx(tool, "ml-auto px-2.5 text-xs font-semibold", preview !== null && "bg-surface-3 text-text")}
        >
          {preview !== null ? "Edit" : "Preview"}
        </button>
      </div>
      {preview !== null && (
        <div className="min-h-24 px-3 py-2.5" aria-live="polite">
          {preview.trim() ? <RichText text={preview} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
        </div>
      )}
      <textarea
        ref={ref}
        {...props}
        onKeyDown={onKeyDown}
        className={clsx(
          "block w-full resize-y rounded-b-lg bg-transparent px-3 py-2 text-sm text-text placeholder:text-faint focus:outline-none",
          preview !== null && "hidden",
          className?.replace(/\binput\b/, ""),
        )}
      />
    </div>
  );
});

const EMOJIS: [string, [string, string][]][] = [
  [
    "Faces",
    [
      ["😀", "grinning"],
      ["😂", "tears of joy"],
      ["🤣", "rolling on the floor"],
      ["😊", "smiling"],
      ["😍", "heart eyes"],
      ["😎", "cool"],
      ["🤔", "thinking"],
      ["😮", "surprised"],
      ["😅", "sweat smile"],
      ["😭", "crying"],
      ["😤", "huffing"],
      ["😡", "angry"],
      ["🥳", "party"],
      ["😴", "sleeping"],
      ["🤯", "mind blown"],
      ["🙃", "upside down"],
    ],
  ],
  [
    "Hands",
    [
      ["👍", "thumbs up"],
      ["👎", "thumbs down"],
      ["👏", "clapping"],
      ["🙌", "raised hands"],
      ["🙏", "thanks"],
      ["💪", "strong"],
      ["👋", "wave"],
      ["🤝", "handshake"],
    ],
  ],
  [
    "Trophies and games",
    [
      ["🏆", "trophy"],
      ["🥇", "gold medal"],
      ["🥈", "silver medal"],
      ["🥉", "bronze medal"],
      ["🎮", "game controller"],
      ["🕹️", "joystick"],
      ["👾", "space invader"],
      ["🎯", "bullseye"],
      ["🏅", "medal"],
      ["⭐", "star"],
      ["🌟", "glowing star"],
      ["💎", "gem"],
      ["🔥", "fire"],
      ["⚡", "lightning"],
      ["💀", "skull"],
      ["👑", "crown"],
    ],
  ],
  [
    "Symbols",
    [
      ["❤️", "heart"],
      ["💯", "hundred"],
      ["✅", "check mark"],
      ["❌", "cross mark"],
      ["⚠️", "warning"],
      ["❓", "question"],
      ["❗", "exclamation"],
      ["🎉", "celebration"],
      ["⏰", "alarm clock"],
      ["📌", "pin"],
      ["🔒", "locked"],
      ["🔑", "key"],
      ["💡", "idea"],
      ["📝", "memo"],
      ["🗺️", "map"],
      ["👀", "eyes"],
    ],
  ],
];
