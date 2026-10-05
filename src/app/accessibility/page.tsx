import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = {
  title: "Accessibility",
  description: `How ${SITE.name} works with screen readers, keyboards and other assistive technology.`,
};

export default function AccessibilityPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Help" title="Accessibility">
        Last reviewed {SITE.legalUpdated}
      </PageHeader>
      <article className="prose-legal">
        <p>
          We want everyone to be able to track trophies, read guides and join the community on {SITE.name}, including people who use
          a screen reader, a keyboard, voice control, zoom or high-contrast settings. We aim to meet the Web Content Accessibility
          Guidelines (WCAG) 2.2 at level AA.
        </p>

        <h2>What we do</h2>
        <ul>
          <li>Text and controls meet the AA contrast ratios: 4.5:1 for text and 3:1 for the edges of form fields.</li>
          <li>Everything works with a keyboard. A &quot;Skip to content&quot; link comes first, and the focused item always has a visible outline.</li>
          <li>Pages use headings and landmarks (header, navigation, main content, footer) so you can jump around with a screen reader.</li>
          <li>Buttons, links, progress bars and trophy icons have names a screen reader can read, like &quot;Hollow Knight completion, 86%&quot; or &quot;gold trophy&quot;.</li>
          <li>Form errors and confirmations are announced, and every field has a label.</li>
          <li>Hidden trophies stay covered until you choose to reveal them, and revealing one moves focus to its name.</li>
          <li>Animations are switched off if your device asks for reduced motion, and pages still work zoomed to 200% or on a small screen.</li>
          <li>Tap targets are at least 24 by 24 pixels.</li>
        </ul>

        <h2>Known limits</h2>
        <ul>
          <li>
            Game icons, trophy icons, screenshots and trailers come from PlayStation Network, IGDB and YouTube. We can&apos;t add
            captions or descriptions to those. Where an image carries meaning, the text next to it says the same thing.
          </li>
          <li>Guides, tips and forum posts are written by members, so their quality and structure vary.</li>
        </ul>

        <h2>Tell us about a problem</h2>
        <p>
          If something on {SITE.name} is hard or impossible for you to use, please{" "}
          <Link href="/contact?topic=accessibility">let us know through the contact form</Link>. Tell us the page and what happened, and we&apos;ll fix it or
          find another way to get you what you need.
        </p>
      </article>
    </div>
  );
}
