const STAR = "M10 1.8l2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z";

/** A read-only row of five stars, filled to `value` (halves rounded). Decorative: pair it with the number in text. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const filled = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex text-gold" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => {
        const part = filled >= i ? 1 : filled >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 20 20" className="absolute inset-0">
              <path d={STAR} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            {part > 0 && (
              // The filled star, cut to half its width for a half star.
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: size * part }}>
                <svg width={size} height={size} viewBox="0 0 20 20">
                  <path d={STAR} fill="currentColor" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
