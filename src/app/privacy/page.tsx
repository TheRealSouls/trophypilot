import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Legal" title="Privacy policy">
        Last updated {SITE.legalUpdated}
      </PageHeader>
      <article className="prose-legal">
        <p>
          This policy explains what personal data {SITE.name} collects, why, and what you can do about it. The data controller is{" "}
          {SITE.operator}. For anything privacy related, use the <Link href="/contact?topic=privacy">contact form</Link>.
        </p>
        <p>
          We handle personal data under the EU General Data Protection Regulation (GDPR) and {SITE.jurisdiction}&apos;s Data
          Protection Acts 1988 to 2018. Our lead supervisory authority is the Data Protection Commission.
        </p>

        <h2>What we collect</h2>
        <h3>When you create an account</h3>
        <ul>
          <li>Email address, username and a hashed password (we never store the password itself).</li>
          <li>Optionally, your country and a short bio.</li>
          <li>Your privacy and leaderboard preferences.</li>
        </ul>
        <h3>When you link PSN</h3>
        <ul>
          <li>Your PSN Online ID, PSN account ID and avatar.</li>
          <li>Your trophy data: games played, trophies earned and when, completion and trophy level.</li>
          <li>A log of sync attempts, so we can show you what happened and fix errors.</li>
        </ul>
        <h3>When you use the site</h3>
        <ul>
          <li>
            Guides, tips, forum threads and posts, community updates, club memberships, game ratings, votes, friend requests, who you
            follow, and sessions and session comments you create or join.
          </li>
          <li>
            Private messages you send and receive. They are stored so the people in the conversation can read them. We don&apos;t
            read them as a matter of course; staff may look at a conversation when someone in it reports abuse or the law requires it.
          </li>
          <li>Profile extras you choose to add: streaming links, a banner, a profile picture and card theme (picked from built-in art or your games; we don't take uploads), your Trophy Vault and a &quot;playing now&quot; status.</li>
          <li>
            Anything you send through the <Link href="/contact">contact form</Link>: your email, the message, and your name, username
            or PSN Online ID if you include them. To limit messages to one a day, we keep a scrambled (hashed) form of your IP
            address, and your account if you&apos;re signed in, for up to two days. We can&apos;t get your IP address back from it.
          </li>
          <li>
            Two essential cookies that keep you signed in, and your theme and account name saved in your browser so pages
            show them straight away. We don&apos;t use advertising or analytics cookies.
          </li>
          <li>
            On the contact page only, Google reCAPTCHA checks that a person is sending the message. Google collects information such
            as your IP address, browser and how you use the page, and may set its own cookie, under{" "}
            <a href="https://policies.google.com/privacy">Google&apos;s privacy policy</a>.
          </li>
          <li>Your guide checklist ticks, stored only in your own browser.</li>
          <li>
            Your IP address, briefly held in memory to rate limit logins and PSN lookups. It isn&apos;t written to our database.
          </li>
        </ul>
        <h3>Public PSN profiles of people without an account</h3>
        <p>
          When someone looks up a public PSN profile, we fetch it from PSN and cache the page for up to 15 minutes. To rank players on
          the global and country leaderboards and show recent platinums, we keep a public summary: Online ID, PSN account ID, avatar,
          the country of the PSN account, PS Plus status, trophy level, trophy counts and how those counts change over time, plus
          their most recently played games with completion and platinum dates. We don&apos;t save trophy-by-trophy history for
          people without an account.
        </p>
        <p>
          We find players this way when someone looks them up, when a member links their account, when we add well-known trophy
          hunters, and through the friends lists of players we already track where PSN makes those lists public. We only ever read
          what PSN shows publicly.
        </p>
        <p>
          If a player&apos;s trophies are private on PSN, we don&apos;t rank them. Anyone can ask us to remove their PSN profile from
          the site entirely through the <Link href="/contact?topic=removal">contact form</Link>; we then hide it from
          lookups, search and leaderboards. We keep this summary because it lets the leaderboards show the real top players
          (our legitimate interest), and it only contains information PSN already shows publicly.
        </p>

        <h2>Why we use it</h2>
        <ul>
          <li>To run your account and show your profile, trophies and rankings (performing our contract with you).</li>
          <li>To keep the site secure and stop abuse, such as rate limiting (our legitimate interest).</li>
          <li>To email you about your account, for example a security issue or a change to these policies (legitimate interest).</li>
        </ul>
        <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>

        <h2>Who can see it</h2>
        <p>
          Your profile visibility setting decides who sees your trophy data: everyone, friends only, or just you. Guides, tips, forum
          posts, community updates, club posts, session comments, game ratings (as averages), your followers and who you follow are
          public. Private messages are seen only by the people in the conversation. Your email address is never shown to other users.
        </p>
        <p>
          We use a small number of service providers to run the site, such as our hosting and database provider, Formspree,
          which receives contact form messages and forwards them to us by email, and Google reCAPTCHA, which filters spam on
          the contact form. They process data only on our instructions. We read trophy data from Sony&apos;s PlayStation Network and game details from IGDB. Game pages
          load screenshots from IGDB&apos;s image server and trailers from YouTube (in privacy-enhanced mode), which see your IP address
          when your browser fetches them. If a provider is outside the European Economic Area, we rely on a European Commission
          adequacy decision or standard contractual clauses.
        </p>

        <h2>How long we keep it</h2>
        <ul>
          <li>Account data: until you delete your account.</li>
          <li>Synced trophy data: until you unlink PSN or delete your account.</li>
          <li>Sync logs: kept with your account and removed when it is deleted.</li>
          <li>
            Messages: your side of a conversation is deleted with your account, or when you leave the conversation and nobody else is
            in it. Messages you sent to others stay in their copy, shown as from a deleted user.
          </li>
          <li>Clubs you own are deleted with your account, along with the updates posted in them.</li>
          <li>
            Forum posts: they stay up after you delete your account, shown as posted by a deleted user, so the conversations
            around them still make sense. Delete any posts you want gone first, or ask us to remove them.
          </li>
          <li>Backups: overwritten within 30 days of deletion.</li>
        </ul>

        <h2>Your rights</h2>
        <p>
          You can access, correct, export or delete your data. Most of this is self-service: edit your profile in{" "}
          <Link href="/settings">Settings</Link>, download everything with &quot;Download my data&quot;, or delete your account there.
          You can also object to processing or ask us to restrict it. Use the <Link href="/contact?topic=privacy">contact form</Link>{" "}
          and we&apos;ll reply within one month.
        </p>
        <p>
          If you&apos;re unhappy with how we handle your data, you can complain to the Data Protection Commission in{" "}
          {SITE.jurisdiction} at <a href="https://www.dataprotection.ie">dataprotection.ie</a>, or to the data protection authority in
          the EU country where you live or work.
        </p>

        <h2>Children</h2>
        <p>The site isn&apos;t meant for children under 13. If we learn that a child under 13 has an account, we&apos;ll delete it.</p>

        <h2>Security</h2>
        <p>
          Passwords are hashed with bcrypt, sessions are signed and sent over HTTPS only, and access to production data is limited.
          No system is perfectly secure. If we have a breach that puts your data at risk, we&apos;ll report it to the Data Protection
          Commission within 72 hours and tell you if it&apos;s likely to affect you seriously, as the GDPR requires.
        </p>

        <h2>Changes</h2>
        <p>
          If we change this policy in a way that matters, we&apos;ll post a notice on the site before it takes effect. The date at
          the top shows when it last changed.
        </p>
      </article>
    </div>
  );
}
