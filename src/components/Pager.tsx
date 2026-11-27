import Link from "next/link";
import clsx from "clsx";
import { PageJump } from "./PageJump";

/** A stand-in page number: the links are built once with it, and the jump box swaps in the page typed. */
const MARK = 987654321;

/**
 * Page numbers in the PSNProfiles style: Previous, the first pages, the
 * pages around the current one, the last pages and Next. Where pages are
 * skipped there's a small box to type any page number and jump to it.
 */
export function Pager({ page, pages, href, label = "Pages" }: { page: number; pages: number; href: (page: number) => string; label?: string }) {
  if (pages <= 1) return null;
  const current = Math.min(Math.max(1, page), pages);
  const shown = new Set<number>([1, 2, pages - 1, pages, current - 2, current - 1, current, current + 1, current + 2].filter((p) => p >= 1 && p <= pages));
  const list = [...shown].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) items.push("gap");
    items.push(p);
  });
  const template = href(MARK);
  const box = "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-semibold tabular-nums";

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-center gap-1.5">
      {current > 1 ? (
        <Link href={href(current - 1)} className={clsx(box, "border-line text-muted hover:border-line-strong hover:text-text")} rel="prev">
          Previous
        </Link>
      ) : (
        <span className={clsx(box, "border-line text-faint")} aria-disabled>
          Previous
        </span>
      )}
      {items.map((p, i) =>
        p === "gap" ? (
          <PageJump key={`gap-${i}`} pages={pages} template={template} mark={String(MARK)} />
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === current ? "page" : undefined}
            aria-label={`Page ${p}`}
            className={clsx(box, p === current ? "border-accent bg-accent text-white" : "border-line text-text hover:border-line-strong")}
          >
            {p}
          </Link>
        ),
      )}
      {current < pages ? (
        <Link href={href(current + 1)} className={clsx(box, "border-line text-muted hover:border-line-strong hover:text-text")} rel="next">
          Next
        </Link>
      ) : (
        <span className={clsx(box, "border-line text-faint")} aria-disabled>
          Next
        </span>
      )}
    </nav>
  );
}
