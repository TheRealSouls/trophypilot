"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { saveTheme, useMe } from "@/components/session";
import { useRouter } from "next/navigation";
import { durationText } from "@/lib/plans";
import {
  deleteAccount,
  searchMyTrophies,
  startPsnLink,
  syncNow,
  updatePrivacy,
  updateProfile,
  updateTheme,
  updateVault,
  verifyPsn,
  type VaultTrophy,
} from "@/actions/account";
import { SubmitButton } from "@/components/client";
import { FormMessage } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";

export type ProfileValues = {
  bio: string;
  country: string;
  youtubeUrl: string;
  twitchUrl: string;
  streamUrl: string;
  allowMessages: string;
};

export function ProfileForm({ values }: { values: ProfileValues }) {
  const [state, action] = useActionState(updateProfile, null);
  const { bio, country } = values;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="bio" className="label">Bio</label>
        <textarea id="bio" name="bio" defaultValue={bio} maxLength={280} rows={3} className="input" placeholder="Favourite plat? Current hunt?" />
      </div>
      <div>
        <label htmlFor="country" className="label">Country</label>
        <select id="country" name="country" defaultValue={country} className="input">
          <option value="">Prefer not to say</option>
          {Object.entries(COUNTRIES).map(([c, n]) => (
            <option key={c} value={c}>{n}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted">
        Your picture, banner, card theme and colour are in{" "}
        <a href="#look" className="link">
          Profile look
        </a>{" "}
        above.
      </p>

      <fieldset className="space-y-3">
        <legend className="label">Where you stream</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="youtubeUrl" className="sr-only">YouTube link</label>
            <input id="youtubeUrl" name="youtubeUrl" defaultValue={values.youtubeUrl} maxLength={200} placeholder="youtube.com/@you" className="input" />
          </div>
          <div>
            <label htmlFor="twitchUrl" className="sr-only">Twitch link</label>
            <input id="twitchUrl" name="twitchUrl" defaultValue={values.twitchUrl} maxLength={200} placeholder="twitch.tv/you" className="input" />
          </div>
          <div>
            <label htmlFor="streamUrl" className="sr-only">Another streaming link</label>
            <input id="streamUrl" name="streamUrl" defaultValue={values.streamUrl} maxLength={200} placeholder="Kick, TikTok or another link" className="input" />
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="allowMessages" className="label">Who can message you</label>
        <select id="allowMessages" name="allowMessages" defaultValue={values.allowMessages} className="input">
          <option value="EVERYONE">Any member</option>
          <option value="FRIENDS">Friends and people I follow</option>
          <option value="NOBODY">Nobody</option>
        </select>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

export function PrivacyForm({
  visibility,
  showOnLeaderboards,
  showActivity,
}: {
  visibility: string;
  showOnLeaderboards: boolean;
  showActivity: boolean;
}) {
  const [state, action] = useActionState(updatePrivacy, null);
  const options = [
    ["PUBLIC", "Public", "Anyone can see your trophies, games and milestones."],
    ["FRIENDS", "Friends only", "Only accepted friends see your trophy data. You only appear on friends leaderboards."],
    ["PRIVATE", "Private", "Only you. You're hidden from every leaderboard and activity feed."],
  ];
  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="label">Profile visibility</legend>
        {options.map(([v, label, help]) => (
          <label key={v} className="flex cursor-pointer gap-3 border border-line p-3 has-[:checked]:border-accent-text has-[:checked]:bg-surface-2">
            <input type="radio" name="profileVisibility" value={v} defaultChecked={visibility === v} className="mt-1 accent-[var(--color-accent)]" />
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="text-sm text-muted">{help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-3">
        <input type="checkbox" name="showOnLeaderboards" defaultChecked={showOnLeaderboards} className="h-4 w-4 accent-[var(--color-accent)]" />
        <span className="text-sm">Show me on leaderboards</span>
      </label>
      <label className="flex items-center gap-3">
        <input type="checkbox" name="showActivity" defaultChecked={showActivity} className="h-4 w-4 accent-[var(--color-accent)]" />
        <span className="text-sm">Show my platinums and rare unlocks in public activity feeds</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton>Save privacy</SubmitButton>
    </form>
  );
}

export function LinkPsnForm({ current }: { current?: string }) {
  const [state, action] = useActionState(startPsnLink, null);
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="onlineId" className="label">PSN Online ID</label>
      <div className="flex gap-2">
        <input id="onlineId" name="onlineId" defaultValue={current} required placeholder="e.g. Rare_Aura" className="input" />
        <SubmitButton pendingText="…">Get code</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function VerifyPsnButton() {
  const [state, action] = useActionState(verifyPsn, null);
  return (
    <form action={action} className="space-y-3">
      <SubmitButton pendingText="Checking PSN and syncing…">I&apos;ve added it, verify</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Sync now, switched off until the plan allows another manual sync. While a
 * sync or import is running the page refreshes itself so progress shows up.
 */
export function SyncButton({ nextAt, busy }: { nextAt: string | null; busy: boolean }) {
  const [state, action] = useActionState(syncNow, null);
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 4_000);
    return () => clearInterval(t);
  }, [busy, router]);

  const waitMs = nextAt ? new Date(nextAt).getTime() - now : 0;
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {!busy && waitMs > 0 ? (
          <>
            <button type="button" disabled className="btn-primary">
              Sync now
            </button>
            <span className="text-xs text-muted">Available again in {durationText(waitMs)}</span>
          </>
        ) : (
          <SubmitButton pendingText="Syncing trophies…" pending={busy || undefined}>
            {busy ? "Syncing…" : "Sync now"}
          </SubmitButton>
        )}
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/**
 * The Trophy Vault picker: the five picks at the top (in order, with Remove),
 * and a search over every trophy the member has earned, by trophy or game
 * name and grade, rarest first. Results load as they type.
 */
export function VaultForm({ picked: initial, hasTrophies }: { picked: VaultTrophy[]; hasTrophies: boolean }) {
  const [state, action] = useActionState(updateVault, null);
  const [picked, setPicked] = useState<VaultTrophy[]>(initial);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState<VaultTrophy[] | null>(null);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    if (!hasTrophies) return;
    const t = setTimeout(() => startSearch(async () => setResults(await searchMyTrophies(q, type))), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, type, hasTrophies]);

  if (!hasTrophies) return <p className="text-sm text-muted">Sync your trophies first, then pick your five best here.</p>;
  const pickedIds = new Set(picked.map((p) => p.id));
  const full = picked.length >= 5;

  return (
    <form action={action} className="space-y-4">
      {picked.map((t) => (
        <input key={t.id} type="hidden" name="trophyIds" value={t.id} />
      ))}
      <div>
        <h3 className="label">Your vault ({picked.length} of 5)</h3>
        {picked.length === 0 ? (
          <p className="text-sm text-muted">Nothing picked yet. Search below and add up to five.</p>
        ) : (
          <ol className="space-y-1.5">
            {picked.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="w-4 text-right text-xs font-semibold tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {t.game} · <span className="capitalize">{t.type.toLowerCase()}</span>
                    {t.rate != null && ` · ${t.rate.toFixed(1)}%`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setPicked((p) => p.filter((x) => x.id !== t.id))}
                  className="btn-ghost px-2.5 py-1 text-xs"
                  aria-label={`Remove ${t.name} from the vault`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="vault-q" className="label">
            Find a trophy
          </label>
          <input
            id="vault-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Trophy or game name"
            autoComplete="off"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="vault-type" className="label">
            Grade
          </label>
          <select id="vault-type" value={type} onChange={(e) => setType(e.target.value)} className="input">
            <option value="">Any</option>
            <option value="PLATINUM">Platinum</option>
            <option value="GOLD">Gold</option>
            <option value="SILVER">Silver</option>
            <option value="BRONZE">Bronze</option>
          </select>
        </div>
      </div>

      <div aria-live="polite" aria-busy={searching} className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
        <p className="sr-only">{results ? `${results.length} trophies found` : "Loading"}</p>
        {results?.length === 0 && <p className="px-2 py-3 text-sm text-muted">No earned trophies match that.</p>}
        {(results ?? []).map((t) => {
          const on = pickedIds.has(t.id);
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{t.name}</span>
                <span className="block truncate text-xs text-muted">
                  {t.game} · <span className="capitalize">{t.type.toLowerCase()}</span>
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{t.rate != null ? `${t.rate.toFixed(1)}%` : ""}</span>
              <button
                type="button"
                disabled={on || full}
                onClick={() => setPicked((p) => (p.length < 5 && !p.some((x) => x.id === t.id) ? [...p, t] : p))}
                className="btn-ghost shrink-0 px-2.5 py-1 text-xs"
                aria-label={on ? `${t.name} is in your vault` : `Add ${t.name} to the vault`}
              >
                {on ? "Added" : "Add"}
              </button>
            </div>
          );
        })}
      </div>
      {full && <p className="text-xs text-muted">The vault holds five. Remove one to add another.</p>}
      <FormMessage state={state} />
      <SubmitButton>Save vault</SubmitButton>
    </form>
  );
}

/**
 * Light or dark. Switches the page at once (applyTheme) and saves the choice
 * to the account in the background, so other devices pick it up too.
 */
export function ThemeForm({ theme }: { theme: string }) {
  const [current, setCurrent] = useState(theme);
  const [, startTransition] = useTransition();
  const { reload } = useMe();
  const choose = (t: string) => {
    setCurrent(t);
    startTransition(async () => {
      await saveTheme(t, () => updateTheme(t));
      await reload();
    });
  };
  return (
    <fieldset>
      <legend className="label">Theme</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["light", "Light", "White background. The default."],
          ["dark", "Dark", "Dark background, easier on the eyes at night."],
        ].map(([value, label, hint]) => (
          <label
            key={value}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-4 has-[:checked]:border-accent-text has-[:checked]:bg-surface-2"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={current === value}
              onChange={() => choose(value)}
              className="mt-1 accent-[var(--color-accent)]"
            />
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="block text-sm text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Switches straight away and is saved to your account.</p>
    </fieldset>
  );
}

export function DeleteAccountForm({ username }: { username: string }) {
  const [state, action] = useActionState(deleteAccount, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="del-password" className="label">Password</label>
          <input id="del-password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <div>
          <label htmlFor="del-confirm" className="label">Type {username} to confirm</label>
          <input id="del-confirm" name="confirm" required autoComplete="off" spellCheck={false} className="input" />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-danger" pendingText="Deleting…">Delete my account</SubmitButton>
    </form>
  );
}
