import clsx from "clsx";
import { PresetAvatar } from "./avatars";
import { CubeLoader } from "./CubeLoader";
import Link from "next/link";
import type { ReactNode } from "react";
import { MAX_TROPHY_LEVEL, rarityOf } from "@/lib/trophies";
import { artHue, secureUrl } from "@/lib/utils";

/**
 * A member's picture. `avatar` is their choice in Settings (User.avatar):
 * a built-in picture, "letter", or a game icon; without one it's their PSN
 * avatar (`url`) or else their initial.
 */
export function Avatar({
  name,
  hue,
  url,
  avatar,
  size = 40,
  className,
}: {
  name: string;
  hue: number;
  url?: string | null;
  avatar?: string | null;
  size?: number;
  className?: string;
}) {
  if (avatar?.startsWith("preset:")) return <PresetAvatar id={avatar.slice(7)} size={size} className={className} />;
  if (avatar?.startsWith("https://")) url = avatar;
  else if (avatar === "letter") url = null;
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={secureUrl(url)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={clsx("shrink-0 rounded-md bg-surface-3 object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white/90", className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42), background: `hsl(${artHue(hue)} 26% 30%)` }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** `label` is what screen readers announce with the percentage, e.g. "Hollow Knight completion". */
export function ProgressBar({
  value,
  className,
  tone = "accent",
  label = "Completion",
}: {
  value: number;
  className?: string;
  tone?: "accent" | "plat" | "gold";
  label?: string;
}) {
  const color = tone === "plat" ? "bg-plat" : tone === "gold" ? "bg-gold" : "bg-accent-text";
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={clsx("h-1.5 w-full bg-surface-3", className)} role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx("h-full", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Trophy level with progress to the next one. Level 999 is the cap, so it shows a full bar instead. */
export function LevelMeter({ level, progress, detail, className }: { level: number; progress: number; detail?: ReactNode; className?: string }) {
  const maxed = level >= MAX_TROPHY_LEVEL;
  return (
    <div className={className}>
      <ProgressBar value={maxed ? 100 : progress} tone={maxed ? "plat" : "accent"} label={maxed ? "Trophy level (max)" : `Progress to trophy level ${level + 1}`} />
      <div className="mt-1 text-[11px] text-muted">
        {maxed ? "Max level" : `${progress}% to level ${level + 1}`}
        {detail && <> · {detail}</>}
      </div>
    </div>
  );
}

const RARITY_STYLE = {
  ULTRA_RARE: "text-ultra border-ultra/50",
  VERY_RARE: "text-very border-very/50",
  RARE: "text-rare border-rare/50",
  COMMON: "text-common border-line",
};

export function RarityBadge({ rate, className }: { rate: number | null | undefined; className?: string }) {
  if (rate == null)
    return (
      <span className={clsx("inline-flex whitespace-nowrap rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-faint", className)} title="PSN hasn't reported an earn rate yet">
        Rarity n/a
      </span>
    );
  const r = rarityOf(rate);
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold", RARITY_STYLE[r.key], className)}>
      {r.label} <span className="tabular-nums">{rate.toFixed(1)}%</span>
    </span>
  );
}

/** A card with a titled header (icon, uppercase title, optional link on the right), as on the home page. */
export function Panel({
  title,
  icon,
  action,
  children,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("card flex min-w-0 flex-col", className)}>
      <header className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        {icon}
        <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className="flex-1 px-5">{children}</div>
    </section>
  );
}

/** Red "See all →" style link for panel and section headers. */
export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline hover:underline-offset-4">
      {children}
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 10h12M11 5l5 5-5 5" />
      </svg>
    </Link>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mb-3 flex items-end justify-between gap-4 border-b border-line pb-2", className)}>
      <h2 className="text-sm font-bold uppercase tracking-wider">{children}</h2>
      {action}
    </div>
  );
}

/** A ruled strip of figures. Children should be <Stat>s. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={clsx("grid gap-px border border-line bg-line", className)}>{children}</dl>;
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx("bg-surface px-4 py-3", className)}>
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-2 px-6 py-10">
      <div className="font-bold">{title}</div>
      {children && <div className="max-w-xl text-sm text-muted">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "good" | "bad"; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={clsx(
        "border px-4 py-3 text-sm",
        tone === "info" && "border-line bg-surface-2 text-text",
        tone === "warn" && "border-gold/50 text-gold",
        tone === "good" && "border-good/50 text-good",
        tone === "bad" && "border-bad/50 text-bad",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabLinks({ tabs, active }: { tabs: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <nav className="flex overflow-x-auto border-b border-line text-sm [scrollbar-width:none]" aria-label="Tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={clsx(
            "whitespace-nowrap border-b-2 px-4 py-2.5",
            t.key === active ? "border-accent font-semibold text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function DifficultyMeter({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted">n/a</span>;
  const v = Math.round(value);
  const tone = v >= 8 ? "bg-bad" : v >= 5 ? "bg-gold" : "bg-good";
  return (
    <span className="inline-flex items-center gap-2" title={`Difficulty ${v}/10`}>
      <span className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={clsx("h-3 w-1.5", i < v ? tone : "bg-surface-3")} />
        ))}
      </span>
      <span className="font-semibold tabular-nums">{v}/10</span>
    </span>
  );
}

export function PageHeader({ title, kicker, children }: { title: ReactNode; kicker?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      {kicker && <div className="mb-1 text-xs uppercase tracking-widest text-accent-text">{kicker}</div>}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-sm text-muted">{children}</div>}
    </header>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } | null }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={clsx("border px-3 py-2 text-sm", state.error ? "border-bad/50 text-bad" : "border-good/50 text-good")}>
      {state.error ?? state.ok}
    </p>
  );
}

/* ─── Skeletons ─────────────────────────────────────────────────────────── */

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={clsx("skeleton block", className)} style={style} />;
}

/** Wraps skeleton markup so screen readers hear one "Loading" instead of noise. */
/** Loading state for a route: the cube trophy, with a faint outline of the page underneath. */
export function SkeletonRegion({ label = "Loading", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={clsx("relative", className)}>
      <span className="sr-only">{label}</span>
      <CubeLoader label={label} />
      <div className="opacity-60">{children}</div>
    </div>
  );
}

export function SkeletonHeader() {
  return (
    <div className="mb-8 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

export function SkeletonRows({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <ul className="card divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          {avatar && <Skeleton className="h-10 w-10 shrink-0" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16" />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonCards({ count = 10, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-3">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="mt-3 h-3 w-12" />
          <Skeleton className="mt-2 h-4 w-4/5" />
          <Skeleton className="mt-3 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
