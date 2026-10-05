import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "./ContactForm";
import { isTopic } from "./topics";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${SITE.name}: questions, bug reports, PSN linking help and data requests.`,
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const user = await getCurrentUser();

  return (
    <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_280px]">
      <div>
        <PageHeader kicker="Support" title="Contact us">
          Questions, bug reports, PSN linking trouble or data requests. We read everything and reply by email.
        </PageHeader>
        <div className="card p-5 sm:p-6">
          <ContactForm
            formId={SITE.formspreeFormId}
            topic={isTopic(topic) ? topic : "general"}
            email={user?.email}
            username={user?.username}
            onlineId={user?.psn?.onlineId}
            captchaSiteKey={process.env.CAPTCHA_SITE_KEY || undefined}
          />
        </div>
      </div>

      <aside className="space-y-6 text-sm lg:pt-16">
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider">Before you write</h2>
          <ul className="space-y-2 text-muted">
            <li>
              Trophies not syncing? Your PSN trophy privacy has to be set to Anyone. Then press Sync now in{" "}
              <Link href="/settings#psn" className="link">
                Settings
              </Link>
              .
            </li>
            <li>Big libraries import in batches, so a first sync can take a few minutes. Refresh Settings to see progress.</li>
            <li>
              You can download or delete your data yourself in{" "}
              <Link href="/settings" className="link">
                Settings
              </Link>
              .
            </li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
