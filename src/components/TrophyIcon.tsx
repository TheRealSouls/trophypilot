import clsx from "clsx";

const COLORS: Record<string, [fill: string, shade: string]> = {
  // Platinum is a cool blue, so it reads apart from silver at a glance.
  PLATINUM: ["#9fc4ef", "#3f6fa6"],
  GOLD: ["#d3a441", "#8f6a1f"],
  SILVER: ["#b6bcc4", "#737a84"],
  BRONZE: ["#bf7a4c", "#7a4526"],
};

/** Flat two-tone trophy glyph. */
export function TrophyIcon({
  type,
  size = 20,
  dim = false,
  className,
}: {
  type: string;
  size?: number;
  dim?: boolean;
  className?: string;
}) {
  const [fill, shade] = COLORS[type] ?? COLORS.BRONZE;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={clsx("shrink-0", dim && "opacity-30 grayscale", className)}
      role="img"
      aria-label={`${type.toLowerCase()} trophy`}
    >
      {type === "PLATINUM" ? (
        <>
          <path d="M6 3h12v3.5a6 6 0 0 1-12 0z" fill={fill} />
          <path d="M6 4.5H3.5a3 3 0 0 0 3.2 4M18 4.5h2.5a3 3 0 0 1-3.2 4" fill="none" stroke={shade} strokeWidth="1.4" />
          <path d="M10.5 12.3h3l.6 4.2h-4.2z" fill={shade} />
          <rect x="7" y="16.5" width="10" height="3.5" fill={fill} />
          <path d="M12 5.2l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 7.3l2-.3z" fill={shade} />
        </>
      ) : (
        <>
          <path d="M6.5 3h11v4a5.5 5.5 0 0 1-11 0z" fill={fill} />
          <path d="M6.5 4.5H4a2.8 2.8 0 0 0 3 3.7M17.5 4.5H20a2.8 2.8 0 0 1-3 3.7" fill="none" stroke={shade} strokeWidth="1.4" />
          <path d="M10.6 12.3h2.8l.5 4.2h-3.8z" fill={shade} />
          <rect x="7.5" y="16.5" width="9" height="3.5" fill={fill} />
        </>
      )}
    </svg>
  );
}

export function TrophyCounts({
  platinum,
  gold,
  silver,
  bronze,
  size = 16,
  className,
}: {
  platinum: number;
  gold: number;
  silver: number;
  bronze: number;
  size?: number;
  className?: string;
}) {
  const items: [string, number][] = [
    ["PLATINUM", platinum],
    ["GOLD", gold],
    ["SILVER", silver],
    ["BRONZE", bronze],
  ];
  return (
    <div className={clsx("flex items-center gap-4 tabular-nums", className)}>
      {items.map(([t, n]) => (
        <span key={t} className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <TrophyIcon type={t} size={size} />
          {n.toLocaleString("en-GB")}
        </span>
      ))}
    </div>
  );
}
