"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { GAME_PLATFORMS, platformName } from "@/lib/utils";

/**
 * Search and filters for the games list. Picking a platform or genre (or the
 * online box) applies straight away; typing a title applies on Enter or with
 * the Search button. Without JavaScript it's a normal form.
 */
export function GameFilterForm({
  q,
  platform,
  genre,
  online,
  sort,
  genres,
}: {
  q: string;
  platform: string;
  genre: string;
  online: boolean;
  sort: string;
  genres: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const p = new URLSearchParams();
    for (const [k, v] of fd) if (typeof v === "string" && v) p.set(k, v);
    startTransition(() => router.push(`/games?${p}`));
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    go(e.currentTarget);
  };

  return (
    <form
      onSubmit={onSubmit}
      action="/games"
      aria-busy={pending}
      className="card mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]"
    >
      <label className="sr-only" htmlFor="gq">
        Search games
      </label>
      <input id="gq" name="q" defaultValue={q} placeholder="Search by title…" className="input" />
      <select
        name="platform"
        defaultValue={platform}
        className="input"
        aria-label="Platform"
        onChange={(e) => e.currentTarget.form && go(e.currentTarget.form)}
      >
        <option value="">All platforms</option>
        {GAME_PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {platformName(p)}
          </option>
        ))}
      </select>
      <select
        name="genre"
        defaultValue={genre}
        className="input"
        aria-label="Genre"
        onChange={(e) => e.currentTarget.form && go(e.currentTarget.form)}
      >
        <option value="">All genres</option>
        {genres.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <input type="hidden" name="sort" value={sort} />
      <button className="btn-primary min-w-24">{pending ? "Loading…" : "Search"}</button>
      <label className="flex items-center gap-2 text-sm text-muted sm:col-span-4">
        <input
          type="checkbox"
          name="online"
          value="0"
          defaultChecked={online}
          onChange={(e) => e.currentTarget.form && go(e.currentTarget.form)}
          className="accent-[var(--color-accent)]"
        />
        Hide games with online trophies
      </label>
    </form>
  );
}
