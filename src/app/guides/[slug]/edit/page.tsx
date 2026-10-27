import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isStaff } from "@/lib/roles";
import { Notice, PageHeader } from "@/components/ui";
import { GuideEditor, type GuideDraft } from "../../new/GuideEditor";

export const metadata: Metadata = { title: "Edit guide", robots: { index: false } };

/** The author (or staff) picks a guide back up: a draft to finish, or a published guide to update. */
export default async function EditGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/guides/${slug}/edit`);
  const g = await prisma.guide.findUnique({
    where: { slug },
    include: {
      game: { select: { id: true, title: true, platforms: true, iconUrl: true } },
      steps: { orderBy: { order: "asc" }, select: { kind: true, title: true, body: true, trophyId: true, videoYoutubeId: true } },
    },
  });
  if (!g || (g.authorId !== user.id && !isStaff(user))) notFound();
  const draft: GuideDraft = {
    id: g.id,
    slug: g.slug,
    status: g.status,
    game: g.game,
    title: g.title === "Untitled guide" ? "" : g.title,
    summary: g.summary,
    difficulty: g.difficulty,
    hoursEstimate: g.hoursEstimate,
    playthroughs: g.playthroughs,
    video: g.videoYoutubeId ? `https://youtu.be/${g.videoYoutubeId}` : "",
    onlineRequired: g.onlineRequired,
    steps: g.steps
      .filter((s) => s.kind !== "TROPHY")
      .map((s) => ({ kind: s.kind, title: s.title, body: s.body, trophyId: s.trophyId ?? "", video: s.videoYoutubeId ? `https://youtu.be/${s.videoYoutubeId}` : "" })),
    notes: Object.fromEntries(g.steps.filter((s) => s.kind === "TROPHY" && s.trophyId).map((s) => [s.trophyId!, s.body])),
  };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker={g.status === "DRAFT" ? "Draft" : "Edit guide"} title={g.title}>
        <Link href={`/guides/${g.slug}`} className="link">
          Back to the guide
        </Link>
      </PageHeader>
      {g.status === "REJECTED" && g.reviewNote && (
        <Notice tone="bad" className="mb-6">
          Staff sent this back: {g.reviewNote}
        </Notice>
      )}
      {g.authorId !== user.id && (
        <Notice tone="warn" className="mb-6">
          You&apos;re editing someone else&apos;s guide as staff. The change is logged.
        </Notice>
      )}
      <GuideEditor draft={draft} trusted={isStaff(user) || user.trusted} />
    </div>
  );
}
