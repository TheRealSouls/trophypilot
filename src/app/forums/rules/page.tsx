import type { Metadata } from "next";
import Link from "next/link";
import { FORUM_TABS } from "@/lib/forum";
import { DEFAULT_FORUM_RULES, parseRules } from "@/lib/forum-rules";
import { FORUM_RULES_KEY, getSetting } from "@/lib/site-settings";
import { RichText } from "@/components/RichText";
import { PageHeader, TabLinks } from "@/components/ui";

export const metadata: Metadata = { title: "Forum rules", description: "What's welcome on the forums and what isn't." };

// Owners and admins edit the rules on the staff dashboard; a minute later everyone sees the change.
export const revalidate = 60;

export default async function ForumRulesPage() {
  const rules = parseRules((await getSetting(FORUM_RULES_KEY)) ?? DEFAULT_FORUM_RULES);
  return (
    <div>
      <PageHeader kicker="Community" title="Forum rules">
        Short version: be the kind of member you&apos;d want replying to your thread.
      </PageHeader>
      <div className="mb-6">
        <TabLinks tabs={FORUM_TABS} active="rules" />
      </div>
      <ol className="card max-w-3xl divide-y divide-line">
        {rules.map(({ title, text }, i) => (
          <li key={`${i}-${title}`} className="flex gap-4 p-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-sm font-bold tabular-nums">{i + 1}</span>
            <div className="min-w-0">
              <h2 className="font-semibold">{title}</h2>
              {text && <RichText text={text} className="mt-1 text-sm text-muted" />}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-3xl text-sm text-muted">
        These sit alongside the <Link href="/terms" className="link">terms of service</Link>. To report a post, use its Report button, message a
        member of the <Link href="/forums/staff" className="link">forum staff</Link> or use the{" "}
        <Link href="/contact?topic=content" className="link">contact form</Link>.
      </p>
    </div>
  );
}
