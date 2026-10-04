"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import type { FormState } from "@/actions/auth";

/**
 * Like useActionState, but once hydrated submits via onSubmit + so
 * React doesn't reset uncontrolled fields, so users keep their input when
 * validation fails. `action` is still set so a submit before hydration is a
 * progressive-enhancement POST (never a GET that leaks fields into the URL).
 * Spread the returned `form` props onto the <form>.
 */
export function useKeepValuesAction(fn: (state: FormState, fd: FormData) => Promise<FormState>, initial: FormState) {
  const [state, action, pending] = useActionState(fn, initial);
  const [, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
  return [state, { action, onSubmit }, pending] as const;
}

export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
  pending: pendingOverride,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingOverride ?? status.pending;
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending && <span className="skeleton h-2 w-2 bg-current" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** Submit button that asks for confirmation first (for destructive actions). */
export function ConfirmButton({ message, children, className = "btn-danger" }: { message: string; children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Hidden trophies stay spoiler-free until the viewer opts in. Wrap the whole
 * trophy in <Spoiler>, then put <SpoilerSwap> around each part that changes
 * (the icon and the text), so one click reveals all of them together.
 */
const SpoilerContext = createContext<{ shown: boolean; reveal: () => void }>({ shown: true, reveal: () => {} });
/** Shared by every Spoiler inside a SpoilerGroup, for "Reveal all hidden trophies". */
const SpoilerGroupContext = createContext<{ all: boolean; setAll: (v: boolean) => void }>({ all: false, setAll: () => {} });

export function SpoilerGroup({ children }: { children: ReactNode }) {
  const [all, setAll] = useState(false);
  return <SpoilerGroupContext.Provider value={{ all, setAll }}>{children}</SpoilerGroupContext.Provider>;
}

/** Shows or re-hides every hidden trophy in the surrounding SpoilerGroup. */
export function RevealAllButton({ count, className = "btn-ghost px-3 py-1.5 text-xs" }: { count: number; className?: string }) {
  const { all, setAll } = useContext(SpoilerGroupContext);
  return (
    <button type="button" onClick={() => setAll(!all)} aria-pressed={all} className={className}>
      {all ? "Hide hidden trophies" : `Reveal all ${count} hidden trophies`}
    </button>
  );
}

export function Spoiler({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const [own, setOwn] = useState(!hidden);
  const { all } = useContext(SpoilerGroupContext);
  return <SpoilerContext.Provider value={{ shown: own || all, reveal: () => setOwn(true) }}>{children}</SpoilerContext.Provider>;
}

/**
 * `focusOnReveal` (use it on the text part) moves keyboard focus to the
 * revealed content, since the Reveal button it replaces disappears.
 */
export function SpoilerSwap({ concealed, children, focusOnReveal = false }: { concealed: ReactNode; children: ReactNode; focusOnReveal?: boolean }) {
  const { shown } = useContext(SpoilerContext);
  const ref = useRef<HTMLDivElement>(null);
  const wasShown = useRef(shown);
  useEffect(() => {
    if (focusOnReveal && shown && !wasShown.current) ref.current?.focus();
    wasShown.current = shown;
  }, [shown, focusOnReveal]);
  if (!shown) return <>{concealed}</>;
  return focusOnReveal ? (
    <div ref={ref} tabIndex={-1} className="outline-none">
      {children}
    </div>
  ) : (
    <>{children}</>
  );
}

/**
 * A hidden trophy's name in a list (recent unlocks, trophy logs, search):
 * "Hidden trophy" with a Reveal button until the viewer opts in. Children
 * are the normal name or link, shown once revealed.
 */
export function SpoilerName({ hidden, children, className }: { hidden: boolean; children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(!hidden);
  const ref = useRef<HTMLSpanElement>(null);
  const revealed = useRef(false);
  useEffect(() => {
    if (shown && revealed.current) ref.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [shown]);
  if (shown) return <span ref={ref} className={clsx("block min-w-0", className)}>{children}</span>;
  return (
    <span className={clsx("flex min-w-0 items-center gap-2", className)}>
      <span className="truncate text-sm font-semibold text-muted">Hidden trophy</span>
      <button
        type="button"
        onClick={() => {
          revealed.current = true;
          setShown(true);
        }}
        aria-label="Reveal this hidden trophy (spoiler)"
        className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs font-semibold text-accent-text hover:border-accent"
      >
        Reveal
      </button>
    </span>
  );
}

/** `heading` makes "Hidden trophy" the page's h1, for the trophy page itself. */
export function RevealButton({ className, heading = false }: { className?: string; heading?: boolean }) {
  const { reveal } = useContext(SpoilerContext);
  const Title = heading ? "h1" : "div";
  return (
    <div className={className}>
      <Title className={clsx("font-semibold text-muted", heading && "text-3xl font-bold")}>Hidden trophy</Title>
      <button
        type="button"
        onClick={reveal}
        aria-label="Reveal this hidden trophy (spoiler)"
        className="text-sm text-accent-text underline-offset-4 hover:underline"
      >
        Reveal (spoiler)
      </button>
    </div>
  );
}

/** Collectible checklist that remembers ticks in localStorage (per guide step). */
export function StepCheck({ id }: { id: string }) {
  const key = `trophypilot:step:${id}`;
  const [done, setDone] = useState(false);
  useEffect(() => {
    try {
      setDone(localStorage.getItem(key) === "1");
    } catch {}
  }, [key]);
  return (
    <button
      type="button"
      aria-pressed={done}
      onClick={() => {
        const next = !done;
        setDone(next);
        try {
          if (next) localStorage.setItem(key, "1");
          else localStorage.removeItem(key);
        } catch {}
      }}
      className={clsx(
        "flex h-6 w-6 shrink-0 items-center justify-center border text-sm",
        done ? "border-good bg-good/15 text-good" : "border-line bg-surface-2 text-transparent hover:border-muted",
      )}
      title={done ? "Mark as not done" : "Mark as done"}
    >
      ✓
    </button>
  );
}
