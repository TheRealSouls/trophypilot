import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Built-in profile pictures (User.avatar = "preset:<key>"). Flat SVG tiles in
 * the same families as the profile cards, so members without PSN (or who'd
 * rather not show their PSN avatar) still get a proper picture.
 */
const trophy = (colour: string) => (
  <g fill={colour}>
    <path d="M13 10h14v6a7 7 0 0 1-14 0z" />
    <path d="M13 12h-3a4 4 0 0 0 4 5M27 12h3a4 4 0 0 1-4 5" fill="none" stroke={colour} strokeWidth="2" />
    <rect x="18.2" y="23" width="3.6" height="4.5" />
    <rect x="14" y="27.5" width="12" height="3.2" rx="0.8" />
  </g>
);

const PRESETS: Record<string, { label: string; bg: string; art: ReactNode }> = {
  platinum: {
    label: "Platinum trophy",
    bg: "#2c3744",
    art: trophy("#d9e1ea"),
  },
  gold: {
    label: "Gold trophy",
    bg: "#4a3606",
    art: trophy("#ecc363"),
  },
  flame: {
    label: "Flame",
    bg: "#3a1208",
    art: (
      <>
        <path d="M20 7c2 5 8 8 8 15a8 8 0 0 1-16 0c0-4 2-6 3.5-8 .3 2.5 1.6 4 3 4.5C17 14 18 10 20 7z" fill="#f08a3c" />
        <path d="M20 19c1 2.5 4 3.6 4 6.5a4 4 0 0 1-8 0c0-2 1.2-3 2-4 .3 1.2.9 2 1.6 2.2C19 22 19.4 20.6 20 19z" fill="#ffd27a" />
      </>
    ),
  },
  wave: {
    label: "Wave",
    bg: "#0a3a57",
    art: (
      <>
        <path d="M6 24c4-6 10-10 17-8-4 1-6 4-5 7 2 4 8 3 11 1 0 5-6 9-12 9-6 0-11-3-11-9z" fill="#4fb3e8" />
        <path d="M6 31c3-2 6-2 9 0s6 2 9 0 6-2 10 0v3H6z" fill="#9ad8f5" />
      </>
    ),
  },
  chip: {
    label: "Circuit chip",
    bg: "#0b2733",
    art: (
      <g stroke="#4fd1c5" strokeWidth="2" fill="none">
        <rect x="12" y="12" width="16" height="16" rx="2" />
        <rect x="16.5" y="16.5" width="7" height="7" fill="#4fd1c5" stroke="none" />
        <path d="M16 12V7M20 12V7M24 12V7M16 33v-5M20 33v-5M24 33v-5M12 16H7M12 20H7M12 24H7M33 16h-5M33 20h-5M33 24h-5" />
      </g>
    ),
  },
  pine: {
    label: "Pine tree",
    bg: "#12301f",
    art: (
      <>
        <circle cx="29" cy="10" r="3" fill="#f1ecd2" />
        <path d="M20 7l7 9h-3.5l5 7h-4l5 6H10.5l5-6h-4l5-7H13z" fill="#6fcf8d" />
        <rect x="18.5" y="29" width="3" height="4" fill="#3f8a5a" />
      </>
    ),
  },
  flake: {
    label: "Snowflake",
    bg: "#dcedf8",
    art: (
      <g stroke="#2e6f9e" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M20 7v26M8.7 13.5l22.6 13M8.7 26.5l22.6-13" />
        <path d="M17 9.5l3 3 3-3M17 30.5l3-3 3 3M9.5 17.5l4-1.2-1.2-4M30.5 22.5l-4 1.2 1.2 4M9.5 22.5l4 1.2-1.2 4M30.5 17.5l-4-1.2 1.2-4" />
      </g>
    ),
  },
  star: {
    label: "Star",
    bg: "#1d2733",
    art: <path d="M20 7l3.9 8.2 8.9 1.1-6.6 6.1 1.8 8.8L20 26.8l-8 4.4 1.8-8.8-6.6-6.1 8.9-1.1z" fill="#e8c766" />,
  },
  cube: {
    label: "Cube",
    bg: "#13284a",
    art: (
      <>
        <path d="M20 8l11 6-11 6-11-6z" fill="#f6a463" />
        <path d="M9 14l11 6v13L9 27z" fill="#e0763a" />
        <path d="M31 14l-11 6v13l11-6z" fill="#a4471c" />
      </>
    ),
  },
  bolt: {
    label: "Lightning bolt",
    bg: "#3b2a06",
    art: <path d="M22 6L11 22h7l-2 12 11-16h-7z" fill="#ffd166" />,
  },
  silver: { label: "Silver trophy", bg: "#343b43", art: trophy("#c9d1d9") },
  bronze: { label: "Bronze trophy", bg: "#3d2416", art: trophy("#d99a66") },
  gamepad: {
    label: "Gamepad",
    bg: "#2a1f4a",
    art: (
      <>
        <path d="M12 14h16a6 6 0 0 1 5.8 4.5l1.6 7a3.5 3.5 0 0 1-6 3.1L26.5 26h-13l-2.9 2.6a3.5 3.5 0 0 1-6-3.1l1.6-7A6 6 0 0 1 12 14z" fill="#b9a6ff" />
        <g fill="#2a1f4a">
          <rect x="11.5" y="18.7" width="5" height="1.6" rx="0.4" />
          <rect x="13.2" y="17" width="1.6" height="5" rx="0.4" />
          <circle cx="26" cy="18.3" r="1.3" />
          <circle cx="28.7" cy="21" r="1.3" />
        </g>
      </>
    ),
  },
  crown: {
    label: "Crown",
    bg: "#3b1d4a",
    art: (
      <g fill="#f4c542">
        <path d="M9 26.5 7.5 14l7 6L20 11l5.5 9 7-6L31 26.5z" />
        <rect x="9" y="27.8" width="22" height="3.2" rx="1" />
        <circle cx="7.5" cy="13" r="1.6" />
        <circle cx="20" cy="10" r="1.6" />
        <circle cx="32.5" cy="13" r="1.6" />
      </g>
    ),
  },
  rocket: {
    label: "Rocket",
    bg: "#101a3a",
    art: (
      <>
        <path d="M17 27h6l-3 7z" fill="#ffb347" />
        <path d="M14.2 19.5 10 26l4.8 1zM25.8 19.5 30 26l-4.8 1z" fill="#e2574c" />
        <path d="M20 6c4 3 6 8 6 14l-2 7h-8l-2-7c0-6 2-11 6-14z" fill="#e6ecf5" />
        <circle cx="20" cy="16" r="2.6" fill="#4fb3e8" />
      </>
    ),
  },
  moon: {
    label: "Moon",
    bg: "#172036",
    art: (
      <>
        <path d="M23 8a12 12 0 1 0 9.5 19.5A10 10 0 0 1 23 8z" fill="#f1e6b8" />
        <circle cx="29" cy="11" r="1.2" fill="#f1e6b8" />
        <circle cx="33" cy="17" r="0.9" fill="#f1e6b8" />
      </>
    ),
  },
  gem: {
    label: "Gem",
    bg: "#3a0f2a",
    art: (
      <>
        <path d="M13 10h14l5 7-12 15L8 17z" fill="#ff6fa8" />
        <path d="M8 17h24M13 10l3 7 4-7 4 7 3-7M16 17l4 15 4-15" fill="none" stroke="#ffd0e3" strokeWidth="1.2" strokeLinejoin="round" />
      </>
    ),
  },
  shield: {
    label: "Shield",
    bg: "#0f2b2b",
    art: (
      <>
        <path d="M20 6l11 4v8c0 7-4.6 12.5-11 15-6.4-2.5-11-8-11-15v-8z" fill="#3fb6a0" />
        <path d="M15 19.5l3.5 3.5 6.5-7" fill="none" stroke="#e9fff9" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  heart: {
    label: "Heart",
    bg: "#3d0f17",
    art: <path d="M20 31s-11-6.6-11-14a6 6 0 0 1 11-3.3A6 6 0 0 1 31 17c0 7.4-11 14-11 14z" fill="#ff5a6e" />,
  },
  ghost: {
    label: "Ghost",
    bg: "#24183a",
    art: (
      <>
        <path d="M11 32V18a9 9 0 0 1 18 0v14l-3-2.5-3 2.5-3-2.5-3 2.5-3-2.5z" fill="#ece8ff" />
        <circle cx="16.5" cy="18.5" r="1.8" fill="#24183a" />
        <circle cx="23.5" cy="18.5" r="1.8" fill="#24183a" />
      </>
    ),
  },
};

export const AVATAR_PRESETS = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])) as Record<string, string>;

export function PresetAvatar({ id, size, className }: { id: string; size: number; className?: string }) {
  const p = Object.hasOwn(PRESETS, id) ? PRESETS[id] : undefined;
  if (!p) return null;
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={clsx("shrink-0 rounded-md", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <rect width="40" height="40" fill={p.bg} />
      {p.art}
    </svg>
  );
}
