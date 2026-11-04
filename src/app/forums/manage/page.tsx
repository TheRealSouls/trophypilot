import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/forum";
import { deleteSection } from "@/actions/forum";
import { ConfirmButton } from "@/components/client";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { SectionForm } from "../forms";

export const metadata: Metadata = { title: "Manage sections · Forums", robots: { index: false } };

export default async function ManageForumsPage() {
  const user = await requireUser("/forums/manage");
  if (!isAdmin(user)) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Manage sections" />
        <Notice tone="bad">Only admins can manage forum sections.</Notice>
      </div>
    );
  }

  // Each game's own forum is made automatically, so it isn't managed here.
  const sections = await prisma.forumSection.findMany({
    where: { gameKey: null },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { threads: true, children: true } } },
  });
  const top = sections.filter((s) => !s.parentId);
  const parents = top.map((s) => ({ id: s.id, name: s.name }));
  const values = (s: (typeof sections)[number]) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    parentId: s.parentId ?? "",
    order: s.order,
    adminOnly: s.adminOnly,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <nav className="mb-4 text-sm text-muted">
        <Link href="/forums" className="hover:text-text">Forums</Link>
      </nav>
      <PageHeader title="Manage sections">
        Sections group the forum. Put sub-sections inside a section (for example a section per platform with a sub-section per
        game or topic). Lower order numbers show first.
      </PageHeader>

      <section className="card mb-10 p-5">
        <h2 className="mb-4 font-bold">New section or sub-section</h2>
        <SectionForm parents={parents} />
      </section>

      {top.length === 0 ? (
        <EmptyState title="No sections yet">Create one above.</EmptyState>
      ) : (
        <div className="space-y-6">
          {top.map((s) => (
            <div key={s.id} className="card">
              <SectionEditor section={s} values={values(s)} parents={parents} />
              {sections
                .filter((c) => c.parentId === s.id)
                .map((c) => (
                  <div key={c.id} className="border-t border-line pl-6">
                    <SectionEditor section={c} values={values(c)} parents={parents} />
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function SectionEditor({
  section,
  values,
  parents,
}: {
  section: { id: string; slug: string; name: string; parentId: string | null; _count: { threads: number; children: number } };
  values: Parameters<typeof SectionForm>[0]["section"];
  parents: { id: string; name: string }[];
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">{section.name}</span>
        <span className="text-xs text-muted">
          {section.parentId ? "sub-section" : "section"} · {plural(section._count.threads, "thread")}
          {section._count.children > 0 && ` · ${plural(section._count.children, "sub-section")}`}
        </span>
        <span className="ml-auto text-xs text-accent-text group-open:hidden">Edit</span>
      </summary>
      <div className="space-y-4 border-t border-line p-4">
        <SectionForm section={values} parents={parents} />
        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Link href={`/forums/${section.slug}`} className="link text-sm">View</Link>
          <form action={deleteSection} className="ml-auto">
            <input type="hidden" name="id" value={section.id} />
            <ConfirmButton
              message={`Delete "${section.name}"? Its sub-sections, threads and posts are deleted too.`}
              className="btn-danger px-3 py-1 text-xs"
            >
              Delete section
            </ConfirmButton>
          </form>
        </div>
      </div>
    </details>
  );
}
