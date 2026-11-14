import type { ReactNode } from "react";

/**
 * The site's own small line icons, drawn on a 20px grid with a 1.75 stroke
 * in currentColor. Decorative: always paired with visible text.
 */
function Icon({ size = 18, className, children }: { size?: number; className?: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

type P = { size?: number; className?: string };

export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8.5" cy="8.5" r="5.5" />
    <path d="m12.5 12.5 4.5 4.5" />
  </Icon>
);

export const ChevronDownIcon = (p: P) => (
  <Icon {...p}>
    <path d="m5 7.5 5 5 5-5" />
  </Icon>
);

export const ArrowRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </Icon>
);

export const TrophyLineIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 3h8v4.5a4 4 0 0 1-8 0V3Z" />
    <path d="M6 5H3.5a2.5 2.5 0 0 0 2.6 3M14 5h2.5a2.5 2.5 0 0 1-2.6 3M10 11.5V14M7 17h6M8 14h4" />
  </Icon>
);

export const GamepadIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6.5 6h7a4 4 0 0 1 3.9 4.9l-.8 3.3a2 2 0 0 1-3.4.9L11.6 13H8.4l-1.6 2.1a2 2 0 0 1-3.4-.9l-.8-3.3A4 4 0 0 1 6.5 6Z" />
    <path d="M6.5 8.5v2.5M5.25 9.75h2.5M13 9.25h.01M14.5 10.75h.01" />
  </Icon>
);

export const UsersIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="7.5" cy="7" r="3" />
    <path d="M2.5 16.5a5 5 0 0 1 10 0M13 4.3a3 3 0 0 1 0 5.4M15 12.2a5 5 0 0 1 2.5 4.3" />
  </Icon>
);

export const ChartIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 16.5V11M8 16.5V6M12 16.5V9M16 16.5V3.5" />
  </Icon>
);

export const StackIcon = (p: P) => (
  <Icon {...p}>
    <path d="m10 3 7 3.5-7 3.5-7-3.5L10 3Z" />
    <path d="m3 10 7 3.5 7-3.5M3 13.5 10 17l7-3.5" />
  </Icon>
);

export const PuzzleIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h3a2 2 0 1 1 4 0h3v3a2 2 0 1 1 0 4v3H4V7Z" />
  </Icon>
);

export const CalendarIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
    <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
  </Icon>
);

export const BookIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3H9a1 1 0 0 1 1 1v13a2 2 0 0 0-2-2H3V4.5ZM17 4.5A1.5 1.5 0 0 0 15.5 3H11a1 1 0 0 0-1 1v13a2 2 0 0 1 2-2h5V4.5Z" />
  </Icon>
);

export const SparkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 2.5 11.8 8.2 17.5 10l-5.7 1.8L10 17.5l-1.8-5.7L2.5 10l5.7-1.8L10 2.5Z" />
  </Icon>
);

export const SyncIcon = (p: P) => (
  <Icon {...p}>
    <path d="M16.5 10a6.5 6.5 0 0 1-11.6 4M3.5 10a6.5 6.5 0 0 1 11.6-4" />
    <path d="M15.5 2.5V6h-3.5M4.5 17.5V14H8" />
  </Icon>
);

export const HeartIcon = (p: P & { filled?: boolean }) => (
  <Icon size={p.size} className={p.className}>
    <path
      d="M10 16.5s-6.5-3.7-6.5-8.2A3.6 3.6 0 0 1 10 6.1a3.6 3.6 0 0 1 6.5 2.2c0 4.5-6.5 8.2-6.5 8.2Z"
      fill={p.filled ? "currentColor" : "none"}
    />
  </Icon>
);

export const ShareIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 12.5V3M6.5 6.5 10 3l3.5 3.5M4 10.5V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5.5" />
  </Icon>
);

export const ChatIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 17 5v7a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5v-3.5h-.5A1.5 1.5 0 0 1 3 12V5Z" />
  </Icon>
);

export const ClockIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4.2l2.8 1.8" />
  </Icon>
);

export const EyeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
    <circle cx="10" cy="10" r="2.5" />
  </Icon>
);

export const FlameIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 17.5a5.5 5.5 0 0 0 5.5-5.5c0-3.5-3-5.5-3.5-9-2.2 1.3-3.2 3.3-3 5.5-1-.5-1.7-1.5-2-2.5C5.6 7.6 4.5 9.6 4.5 12a5.5 5.5 0 0 0 5.5 5.5Z" />
  </Icon>
);

export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="m4 10.5 4 4 8-9" />
  </Icon>
);

export const StarIcon = (p: P & { filled?: boolean }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 20 20" aria-hidden className={p.className} fill={p.filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
    <path d="m10 2.5 2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7L10 2.5Z" />
  </svg>
);

export const PinIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 17.5s5.5-5 5.5-9.5a5.5 5.5 0 0 0-11 0c0 4.5 5.5 9.5 5.5 9.5Z" />
    <circle cx="10" cy="8" r="2" />
  </Icon>
);
