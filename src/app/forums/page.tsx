import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { FORUM_TABS, forumIndex, isAdmin } from "@/lib/forum";
import { formatNumber, timeAgo } from "@/lib/utils";
import { EmptyState, PageHeader, TabLinks } from "@/components/ui";
import { ForumSearchBox } from "./ForumSearchBox";

export const metadata: Metadata = { title: "Forums", description: "Talk trophies, platinums and games with other hunters." };

export default async function ForumsPage() {
  const [user, sections] = await Promise.all([getCurrentUser(), forumIndex()]);
  const admin = isAdmin(user);

  return (
    <div>
      <PageHeader kicker="Community" title="Forums">
        Talk trophies, platinums and the games you&apos;re hunting.
      </PageHeader>

      <div className="mb-6">
        <TabLinks tabs={FORUM_TABS} active="forums" />
      </div>

      <ForumSearchBox />

      <div className="mb-6 flex flex-wrap gap-2">
        {sections.length > 0 && (
          <Link href="/forums/new" className="btn-primary">
            New thread
          </Link>
        )}
        {admin && (
          <Link href="/forums/manage" className="btn-ghost">
            Manage sections
          </Link>
        )}
      </div>

      {sections.length === 0 ? (
        <EmptyState
          title="No sections yet"
          action={
            admin ? (
              <Link href="/forums/manage" className="btn-primary">
                Create the first section
              </Link>
            ) : undefined
          }
        >
          {admin ? "Create sections and sub-sections, then members can start threads in them." : "The forums open soon."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.id} className="card" aria-labelledby={`sec-${s.id}`}>
              <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line bg-surface-2 px-4 py-3">
                <h2 id={`sec-${s.id}`} className="font-bold">
                  <Link href={`/forums/${s.slug}`} className="hover:underline hover:underline-offset-4">
                    {s.name}
                  </Link>
                </h2>
                {s.description && <p className="text-sm text-muted">{s.description}</p>}
                <span className="ml-auto text-xs text-muted">
                  {formatNumber(s.total.threads)} threads · {formatNumber(s.total.posts)} posts
                </span>
              </header>
              {s.children.length > 0 ? (
                <ul className="divide-y divide-line">
                  {s.children.map((c) => (
                    <SectionRow key={c.id} section={c} />
                  ))}
                </ul>
              ) : (
                <ul>
                  <SectionRow section={{ ...s, description: "" }} label="Threads" />
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionRow({
  section,
  label,
}: {
  section: {
    slug: string;
    name: string;
    description: string;
    threads: number;
    posts: number;
    latest: { id: string; title: string; lastPostAt: Date } | null;
  };
  label?: string;
}) {
  return (
    <li className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_140px_220px] sm:items-center">
      <div className="min-w-0">
        <Link href={`/forums/${section.slug}`} className="font-semibold hover:underline hover:underline-offset-4">
          {label ?? section.name}
        </Link>
        {section.description && <p className="text-sm text-muted">{section.description}</p>}
      </div>
      <div className="text-xs text-muted">
        {formatNumber(section.threads)} threads · {formatNumber(section.posts)} posts
      </div>
      <div className="min-w-0 text-xs">
        {section.latest ? (
          <>
            <Link href={`/forums/thread/${section.latest.id}`} className="block truncate font-semibold hover:underline hover:underline-offset-4">
              {section.latest.title}
            </Link>
            <span className="text-muted">{timeAgo(section.latest.lastPostAt)}</span>
          </>
        ) : (
          <span className="text-faint">No threads yet</span>
        )}
      </div>
    </li>
  );
}
