import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Built-in profile pictures (User.avatar = "preset:<key>"). Flat SVG tiles in
 * the same families as the profile cards, so members without PSN (or who'd
 * rather not show their PSN avatar) still get a proper picture.
 */
const PRESETS: Record<string, { label: string; bg: string; art: ReactNode }> = {
  platinum: {
    label: "Platinum trophy",
    bg: "#2c3744",
    art: (
      <g fill="#d9e1ea">
        <path d="M13 10h14v6a7 7 0 0 1-14 0z" />
        <path d="M13 12h-3a4 4 0 0 0 4 5M27 12h3a4 4 0 0 1-4 5" fill="none" stroke="#d9e1ea" strokeWidth="2" />
        <rect x="18.2" y="23" width="3.6" height="4.5" />
        <rect x="14" y="27.5" width="12" height="3.2" rx="0.8" />
      </g>
    ),
  },
  gold: {
    label: "Gold trophy",
    bg: "#4a3606",
    art: (
      <g fill="#ecc363">
        <path d="M13 10h14v6a7 7 0 0 1-14 0z" />
        <path d="M13 12h-3a4 4 0 0 0 4 5M27 12h3a4 4 0 0 1-4 5" fill="none" stroke="#ecc363" strokeWidth="2" />
        <rect x="18.2" y="23" width="3.6" height="4.5" />
        <rect x="14" y="27.5" width="12" height="3.2" rx="0.8" />
      </g>
    ),
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
};

export const AVATAR_PRESETS = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.label])) as Record<string, string>;

export function PresetAvatar({ id, size, className }: { id: string; size: number; className?: string }) {
  const p = PRESETS[id];
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
