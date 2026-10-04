"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { updateLook } from "@/actions/account";
import { PROFILE_ACCENTS, PROFILE_CARDS, accentClass, bannerImage, cardClass } from "@/lib/profile-themes";
import { AVATAR_PRESETS } from "@/components/avatars";
import { ProfileCardArt } from "@/components/ProfileCardArt";
import { SceneArt } from "@/components/art";
import { SubmitButton } from "@/components/client";
import { useMe } from "@/components/session";
import { Avatar, FormMessage } from "@/components/ui";

export type LookGame = { id: string; slug: string; title: string; coverHue: number; iconUrl: string | null; screenshots: string };

export type LookValues = { profileCard: string; profileAccent: string; bannerGameId: string; avatar: string };

const ACCENT_SWATCH: Record<string, string> = {
  "": "#dc332a",
  blue: "#1f63d6",
  green: "#1f7a3d",
  teal: "#0f766e",
  gold: "#8a6100",
  slate: "#475569",
};

/**
 * Profile look: card theme, picture, banner and accent colour, with a live
 * preview. Every picker is a native radio group (arrow keys move, Space
 * picks) with a text label for each option; the preview is decorative and
 * the current choices are also written out under it.
 */
export function LookForm({
  values,
  games,
  allGames,
  name,
  avatarHue,
  psnAvatarUrl,
}: {
  values: LookValues;
  /** The member's most recently played games, shown as pictures. */
  games: LookGame[];
  /** Every game they have, for the banner list. */
  allGames: { id: string; title: string }[];
  name: string;
  avatarHue: number;
  psnAvatarUrl: string | null;
}) {
  const [state, action] = useActionState(updateLook, null);
  const { reload } = useMe();
  // The navbar shows the picture too.
  useEffect(() => {
    if (state?.ok) void reload();
  }, [state, reload]);
  const [card, setCard] = useState(values.profileCard);
  const [accent, setAccent] = useState(values.profileAccent);
  const [banner, setBanner] = useState(values.bannerGameId);
  // Game pictures are stored as their icon URL; in the form they're "game:<id>".
  const [avatar, setAvatar] = useState(() => {
    const g = games.find((x) => x.iconUrl && values.avatar === x.iconUrl.replace(/^http:/, "https:"));
    return g ? `game:${g.id}` : values.avatar;
  });

  const gameById = new Map(games.map((g) => [g.id, g]));
  const bannerGame = banner ? gameById.get(banner) : undefined;
  const bannerUrl = bannerGame ? bannerImage(bannerGame) : null;
  const previewAvatar = avatar.startsWith("game:") ? (gameById.get(avatar.slice(5))?.iconUrl ?? null) : avatar || null;
  const bannerTitle = banner ? (allGames.find((g) => g.id === banner)?.title ?? "your game") : null;

  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="profileCard" value={card} />
      <input type="hidden" name="profileAccent" value={accent} />
      <input type="hidden" name="bannerGameId" value={banner} />
      <input type="hidden" name="avatar" value={avatar} />

      {/* Live preview */}
      <div>
        <p className="label">Preview</p>
        <div className={clsx(accentClass(accent))}>
          <div className={clsx("card relative overflow-hidden", cardClass(card))} aria-hidden>
            <div className="relative h-24 overflow-hidden bg-surface-3">
              {bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : bannerGame ? (
                <SceneArt seed={`${bannerGame.slug}-banner`} hue={bannerGame.coverHue} className="h-full w-full rounded-none border-0" />
              ) : (
                <ProfileCardArt card={card} part="banner" />
              )}
            </div>
            <div className="relative flex items-end gap-3 px-4 pb-4">
              <ProfileCardArt card={card} part="body" />
              <Avatar
                name={name}
                hue={avatarHue}
                url={psnAvatarUrl}
                avatar={previewAvatar ? (previewAvatar.startsWith("http:") ? previewAvatar.replace(/^http:/, "https:") : previewAvatar) : null}
                size={64}
                className="relative -mt-8 border-4 border-surface"
              />
              <div className="relative min-w-0 pb-1">
                <div className="truncate text-lg font-bold">{name}</div>
                <div className="flex gap-1.5">
                  <span className="chip">Level 1</span>
                  <span className="chip border-accent-text/50 text-accent-text">Accent</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted">
          Card: <strong className="text-text">{PROFILE_CARDS[card as keyof typeof PROFILE_CARDS]?.name ?? "Plain"}</strong>. Banner:{" "}
          <strong className="text-text">{bannerTitle ?? (card ? "the card's own art" : "none")}</strong>. Colour:{" "}
          <strong className="text-text">{PROFILE_ACCENTS[accent as keyof typeof PROFILE_ACCENTS] ?? "Red"}</strong>.
        </p>
      </div>

      <Picker legend="Profile card" hint="Recolours your profile header and brings its own animated banner.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(PROFILE_CARDS).map(([key, c]) => (
            <Choice key={key || "plain"} name="cardChoice" checked={card === key} onPick={() => setCard(key)} label={`${c.name}: ${c.blurb}`}>
              <span className={clsx("relative block h-16 overflow-hidden rounded-t-[7px] bg-surface-3", cardClass(key))}>
                <ProfileCardArt card={key} part="banner" />
              </span>
              <span className="block px-2.5 py-2">
                <span className="block text-sm font-semibold">{c.name}</span>
                <span className="block text-xs leading-snug text-muted">{c.blurb}</span>
              </span>
            </Choice>
          ))}
        </div>
      </Picker>

      <Picker legend="Profile picture" hint="Your PSN avatar, a built-in picture, or one of your games.">
        <div className="flex flex-wrap gap-2">
          <Choice name="avatarChoice" checked={avatar === ""} onPick={() => setAvatar("")} label={psnAvatarUrl ? "Your PSN avatar" : "Your initial (default)"} tile>
            <Avatar name={name} hue={avatarHue} url={psnAvatarUrl} size={52} />
          </Choice>
          {psnAvatarUrl && (
            <Choice name="avatarChoice" checked={avatar === "letter"} onPick={() => setAvatar("letter")} label="Your initial" tile>
              <Avatar name={name} hue={avatarHue} avatar="letter" size={52} />
            </Choice>
          )}
          {Object.entries(AVATAR_PRESETS).map(([key, label]) => (
            <Choice key={key} name="avatarChoice" checked={avatar === `preset:${key}`} onPick={() => setAvatar(`preset:${key}`)} label={label} tile>
              <Avatar name={name} hue={avatarHue} avatar={`preset:${key}`} size={52} />
            </Choice>
          ))}
          {games
            .filter((g) => g.iconUrl)
            .map((g) => (
              <Choice key={g.id} name="avatarChoice" checked={avatar === `game:${g.id}`} onPick={() => setAvatar(`game:${g.id}`)} label={`${g.title} icon`} tile>
                <Avatar name={name} hue={avatarHue} url={g.iconUrl} size={52} className="object-contain" />
              </Choice>
            ))}
        </div>
      </Picker>

      <Picker legend="Banner" hint="Artwork from one of your games across the top of your profile. With no banner, your card's own art shows.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Choice name="bannerChoice" checked={banner === ""} onPick={() => setBanner("")} label={card ? "No game banner: use the card's art" : "No banner"}>
            <span className={clsx("relative flex h-16 items-center justify-center overflow-hidden rounded-t-[7px] bg-surface-3 text-xs text-muted", cardClass(card))}>
              {card ? <ProfileCardArt card={card} part="banner" /> : "None"}
            </span>
            <span className="block px-2.5 py-2 text-sm font-semibold">{card ? "Card art" : "No banner"}</span>
          </Choice>
          {games.map((g) => {
            const url = bannerImage(g);
            return (
              <Choice key={g.id} name="bannerChoice" checked={banner === g.id} onPick={() => setBanner(g.id)} label={`${g.title} artwork`}>
                <span className="block h-16 overflow-hidden rounded-t-[7px] bg-surface-3">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : (
                    <SceneArt seed={`${g.slug}-banner`} hue={g.coverHue} className="h-full w-full rounded-none border-0" />
                  )}
                </span>
                <span className="block truncate px-2.5 py-2 text-sm font-semibold">{g.title}</span>
              </Choice>
            );
          })}
        </div>
        {allGames.length > games.length && (
          <div className="mt-3 max-w-sm">
            <label htmlFor="banner-any" className="label">
              Or any of your games
            </label>
            <select id="banner-any" value={banner} onChange={(e) => setBanner(e.target.value)} className="input">
              <option value="">No game banner</option>
              {allGames.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </Picker>

      <Picker legend="Accent colour" hint="Buttons, links and highlights on your profile page.">
        <div className="flex flex-wrap gap-2">
          {Object.entries(PROFILE_ACCENTS).map(([key, label]) => (
            <Choice key={key || "red"} name="accentChoice" checked={accent === key} onPick={() => setAccent(key)} label={label} tile>
              <span className="flex items-center gap-2 px-3 py-2">
                <span className="h-5 w-5 rounded-full" style={{ background: ACCENT_SWATCH[key] }} aria-hidden />
                <span className="text-sm font-semibold" aria-hidden>
                  {label.replace(" (site default)", "")}
                </span>
              </span>
            </Choice>
          ))}
        </div>
      </Picker>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <SubmitButton pendingText="Saving…">Save profile look</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function Picker({ legend, hint, children }: { legend: string; hint: string; children: ReactNode }) {
  const id = `hint-${legend.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <fieldset aria-describedby={id}>
      <legend className="label">{legend}</legend>
      <p id={id} className="-mt-1 mb-3 text-sm text-muted">
        {hint}
      </p>
      {children}
    </fieldset>
  );
}

/** One option: a real radio button (visually hidden) with a picture; the ring shows the pick and keyboard focus. */
function Choice({
  name,
  checked,
  onPick,
  label,
  tile = false,
  children,
}: {
  name: string;
  checked: boolean;
  onPick: () => void;
  label: string;
  tile?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={clsx("relative block cursor-pointer", tile && "inline-block")}>
      <input type="radio" name={name} checked={checked} onChange={onPick} className="peer sr-only" />
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className={clsx(
          "block overflow-hidden rounded-lg border-2 bg-surface transition-colors",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-text",
          checked ? "border-accent" : "border-line hover:border-line-strong",
          tile && "p-0.5",
        )}
      >
        {children}
      </span>
      {checked && (
        <span aria-hidden className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </label>
  );
}
