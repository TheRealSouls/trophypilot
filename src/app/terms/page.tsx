import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Legal" title="Terms of service">
        Last updated {SITE.legalUpdated}
      </PageHeader>
      <article className="prose-legal">
        <p>
          These terms cover your use of {SITE.name} (&quot;the site&quot;), run by {SITE.operator} (&quot;we&quot;). By creating an
          account or using the site you agree to them. If you don&apos;t agree, please don&apos;t use the site.
        </p>

        <h2>1. What the site is</h2>
        <p>
          {SITE.name} is an independent fan site for PlayStation trophy hunters. It shows trophy data from PlayStation Network,
          community guides and tips, leaderboards and co-op session listings. We are not affiliated with, endorsed or sponsored by
          Sony Interactive Entertainment. PlayStation and PSN are trademarks of Sony Interactive Entertainment Inc.
        </p>

        <h2>2. Your account</h2>
        <ul>
          <li>You must be at least 13 years old, or older if the law where you live requires it.</li>
          <li>Give us a real email address and keep your password to yourself. You&apos;re responsible for what happens under your account.</li>
          <li>One person per account. Don&apos;t create accounts to get around a suspension or to game the leaderboards.</li>
          <li>You can delete your account at any time from Settings.</li>
        </ul>

        <h2>3. Linking a PSN account</h2>
        <p>
          You may only link a PSN account that you own. We verify ownership with a code you place in your PSN About Me. We never ask
          for your PSN password and you should never give it to us. Trophy data is read from Sony&apos;s servers, so it is only as
          accurate and current as PSN is. If your trophy list is private on PSN, we can&apos;t sync it.
        </p>

        <h2>4. Public PSN profiles</h2>
        <p>
          Anyone can look up a public PSN profile on the site. We show the same information PSN makes public (Online ID, avatar,
          trophy level and trophy lists). Players we&apos;ve seen appear on the all-time global and country leaderboards using the
          public totals PSN reports; we don&apos;t store their game-by-game trophy history unless they link their account. If
          you&apos;d like your PSN profile removed from lookups and leaderboards, set your PSN trophies to private or{" "}
          <Link href="/contact?topic=removal">ask us to remove it</Link>.
        </p>

        <h2>5. What you post</h2>
        <p>
          You keep ownership of the guides, tips and other content you post. By posting, you give us a worldwide, non-exclusive,
          royalty-free licence to host, display, adapt for formatting and distribute that content on the site. This licence ends
          when you delete the content or your account, except where others have already relied on it (for example a quoted tip) or
          where we have to keep it for legal reasons. Forum posts are the exception: they stay up after you delete your account,
          shown as posted by a deleted user, unless you delete them first or ask us to.
        </p>
        <p>You agree not to post anything that:</p>
        <ul>
          <li>is illegal, hateful, harassing, sexually explicit or threatening;</li>
          <li>copies someone else&apos;s guide, video or writing without permission;</li>
          <li>shares cheats, save edits or exploits that would get other players&apos; accounts banned, presented as legitimate;</li>
          <li>advertises paid boosting, account sharing or selling accounts;</li>
          <li>contains another person&apos;s private information.</li>
        </ul>
        <p>We can remove content or suspend accounts that break these rules. We&apos;ll tell you why when we reasonably can.</p>

        <h2>6. Fair use of the service</h2>
        <p>
          Don&apos;t scrape the site, overload it, probe it for vulnerabilities without permission, or use it to send bulk requests
          to PlayStation Network. We rate limit lookups to keep the service working for everyone.
        </p>

        <h2>7. Leaderboards</h2>
        <p>
          Rankings come from synced PSN data. We may remove accounts from leaderboards if trophy data looks manipulated (for example
          impossible unlock times), and we don&apos;t have to explain the details of how we detect this.
        </p>

        <h2>8. No warranty</h2>
        <p>
          The site is provided as is. Guides and tips are written by the community and may be wrong or out of date, especially
          after game patches. We don&apos;t promise the site will always be available or error free.
        </p>

        <h2>9. Liability</h2>
        <p>
          To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, or for anything you do based on
          a guide or tip, such as a missed trophy or lost save. Nothing in these terms limits liability that can&apos;t be limited
          by law, including for death or personal injury caused by negligence, or fraud.
        </p>

        <h2>10. Changes</h2>
        <p>
          We may update these terms. If a change is significant we&apos;ll give notice on the site or by email before it takes
          effect. Continuing to use the site after that means you accept the new terms.
        </p>

        <h2>11. Law</h2>
        <p>
          These terms are governed by the laws of {SITE.jurisdiction}, and the courts of {SITE.jurisdiction} deal with any dispute
          about them. If you use the site as a consumer and live outside {SITE.jurisdiction}, you keep the protection of the
          mandatory consumer laws where you live, and you can also bring a claim in your local courts.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about these terms: use the <Link href="/contact">contact form</Link>. How we handle your data is
          covered in the <Link href="/privacy">privacy policy</Link>.
        </p>
      </article>
    </div>
  );
}
