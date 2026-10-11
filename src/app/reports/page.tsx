import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/forum";
import { REPORT_REASONS, REPORT_TYPE_NAMES, type ReportType } from "@/lib/reports";
import { resolveReport } from "@/actions/reports";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { LocalTime } from "@/components/LocalTime";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

/**
 * Staff only: what members have reported. Remove takes the content down
 * (and closes every report about it); Dismiss closes the report and leaves
 * the content. Profiles can't be removed from here.
 */
export default async function ReportsPage() {
  const me = await requireUser("/reports");
  if (!isAdmin(me)) notFound();
  const [open, recent] = await Promise.all([
    prisma.report.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { reporter: { select: { username: true } } },
    }),
    prisma.report.findMany({
      where: { status: { not: "OPEN" } },
      orderBy: { resolvedAt: "desc" },
      take: 20,
      include: { resolvedBy: { select: { username: true } } },
    }),
  ]);
  // How many people reported the same thing.
  const counts = new Map<string, number>();
  for (const r of open) counts.set(`${r.targetType}:${r.targetId}`, (counts.get(`${r.targetType}:${r.targetId}`) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker="Staff" title="Reports">
        Things members have flagged. Oldest first. Removing something closes every report about it.
      </PageHeader>

      {open.length === 0 ? (
        <EmptyState title="Nothing to review">No open reports. Nice.</EmptyState>
      ) : (
        <ol className="space-y-3">
          {open.map((r) => {
            const others = (counts.get(`${r.targetType}:${r.targetId}`) ?? 1) - 1;
            const name = REPORT_TYPE_NAMES[r.targetType as ReportType] ?? r.targetType;
            return (
              <li key={r.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="chip text-text">{name}</span>
                  <span className="chip border-bad/50 text-bad">{REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? r.reason}</span>
                  {others > 0 && <span className="chip">+{others} more report{others === 1 ? "" : "s"}</span>}
                  <span className="ml-auto text-xs text-muted">
                    <LocalTime date={r.createdAt} /> · by {r.reporter?.username ?? "a deleted member"}
                  </span>
                </div>
                {r.excerpt && (
                  <blockquote className="mt-3 border-l-2 border-line-strong pl-3 text-sm text-muted">{r.excerpt}</blockquote>
                )}
                {r.details && <p className="mt-2 text-sm">“{r.details}”</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.targetType !== "MESSAGE" ? (
                    <Link href={r.url} className="btn-ghost px-3 py-1.5 text-xs" target="_blank">
                      Open it
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">A private message: the text above is what was reported.</span>
                  )}
                  {r.targetType !== "USER" && (
                    <form action={resolveReport}>
                      <input type="hidden" name="reportId" value={r.id} />
                      <input type="hidden" name="decision" value="remove" />
                      <ConfirmButton message={`Delete this ${name.toLowerCase()}? This can't be undone.`} className="btn-danger px-3 py-1.5 text-xs">
                        Remove it
                      </ConfirmButton>
                    </form>
                  )}
                  <form action={resolveReport}>
                    <input type="hidden" name="reportId" value={r.id} />
                    <input type="hidden" name="decision" value="dismiss" />
                    <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">{r.targetType === "USER" ? "Mark handled" : "Dismiss"}</SubmitButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">Recently handled</h2>
          <ul className="card divide-y divide-line text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="font-semibold">{REPORT_TYPE_NAMES[r.targetType as ReportType] ?? r.targetType}</span>
                <span className={r.status === "REMOVED" ? "text-bad" : "text-muted"}>{r.status === "REMOVED" ? "removed" : "dismissed"}</span>
                <span className="ml-auto text-xs text-muted">
                  {r.resolvedBy?.username ?? "staff"} · {r.resolvedAt && <LocalTime date={r.resolvedAt} />}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
