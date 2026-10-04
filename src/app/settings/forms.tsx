"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { saveTheme, useMe } from "@/components/session";
import { useRouter } from "next/navigation";
import { durationText } from "@/lib/plans";
import { deleteAccount, startPsnLink, syncNow, updatePrivacy, updateProfile, updateTheme, updateVault, verifyPsn } from "@/actions/account";
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

export type VaultOption = { id: string; name: string; game: string; type: string; rate: number | null };

/** Tick up to five earned trophies to show in the Trophy Vault on the profile. */
export function VaultForm({ options, picked: initial }: { options: VaultOption[]; picked: string[] }) {
  const [state, action] = useActionState(updateVault, null);
  const [picked, setPicked] = useState<string[]>(initial);
  if (options.length === 0) return <p className="text-sm text-muted">Sync your trophies first, then pick your five best here.</p>;
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-muted">
        Pick up to five trophies to show off at the top of your profile. Your rarest ones are listed first. {picked.length} of 5 picked.
      </p>
      <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
        {options.map((t) => {
          const on = picked.includes(t.id);
          return (
            <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
              <input
                type="checkbox"
                name="trophyIds"
                value={t.id}
                checked={on}
                disabled={!on && picked.length >= 5}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))}
                className="accent-[var(--color-accent)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{t.name}</span>
                <span className="block truncate text-xs text-muted">
                  {t.game} · <span className="capitalize">{t.type.toLowerCase()}</span>
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{t.rate != null ? `${t.rate.toFixed(1)}%` : ""}</span>
            </label>
          );
        })}
      </div>
      <FormMessage state={state} />
      <SubmitButton>Save vault</SubmitButton>
    </form>
  );
}

/** Light or dark. Picking one applies it straight away; the button covers browsers without JavaScript. */
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
