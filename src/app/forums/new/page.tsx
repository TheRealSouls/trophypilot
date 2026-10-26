import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/forum";
import { EmptyState, PageHeader } from "@/components/ui";
import { ThreadForm } from "../forms";

export const metadata: Metadata = { title: "New thread · Forums", robots: { index: false } };

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ section?: string; game?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser(`/forums/new${sp.section ? `?section=${sp.section}` : ""}`);
  const [sections, game] = await Promise.all([
    prisma.forumSection.findMany({
      where: isStaff(user) ? {} : { adminOnly: false },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, parentId: true },
    }),
    sp.game ? prisma.game.findUnique({ where: { id: sp.game }, select: { id: true, title: true, platforms: true, iconUrl: true } }) : null,
  ]);

  // Sub-sections are listed under their parent, labelled "Parent / Child".
  const byId = new Map(sections.map((s) => [s.id, s]));
  const options = sections
    .map((s) => ({ id: s.id, slug: s.slug, label: s.parentId ? `${byId.get(s.parentId)?.name ?? ""} / ${s.name}` : s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const preselected = options.find((o) => o.slug === sp.section)?.id ?? "";

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/forums" className="hover:text-text">Forums</Link>
      </nav>
      <PageHeader title="New thread">Pick a section, give it a clear title, and tag the game if it&apos;s about one.</PageHeader>
      {options.length === 0 ? (
        <EmptyState title="No sections to post in yet">An admin needs to create the forum sections first.</EmptyState>
      ) : (
        <ThreadForm sections={options} sectionId={preselected} initialGame={game} />
      )}
    </div>
  );
}
