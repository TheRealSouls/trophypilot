import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoMode, nextManualSyncAt } from "@/lib/psn/sync";
import { durationText, everyText, planOf } from "@/lib/plans";
import { SITE } from "@/lib/site";
import { isDemoAccount } from "@/lib/demo";
import { formatDate, timeAgo } from "@/lib/utils";
import { unlinkPsn } from "@/actions/account";
import { Avatar, Notice, PageHeader, ProgressBar } from "@/components/ui";
import { ConfirmButton } from "@/components/client";
import { DeleteAccountForm, LinkPsnForm, PrivacyForm, ProfileForm, SyncButton, ThemeForm, VaultForm, VerifyPsnButton } from "./forms";
import { LookForm } from "./LookForm";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string; linked?: string }> }) {
  const user = await requireUser("/settings");
  const { welcome, linked } = await searchParams;
  const psn = user.psn;
  const [jobs, nextManual, imported] = await Promise.all([
    prisma.syncJob.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 5 }),
    psn?.verified ? nextManualSyncAt(user.id, user.plan) : null,
    psn?.verified ? prisma.psnTitleSync.count({ where: { userId: user.id } }) : 0,
  ]);
  const [myGames, recentGames, vaultOptions, vault] = await Promise.all([
    prisma.userGame.findMany({ where: { userId: user.id }, orderBy: { game: { title: "asc" } }, select: { game: { select: { id: true, title: true } } } }),
    // Pictures for the banner and profile picture pickers: their most recently played games.
    prisma.userGame.findMany({
      where: { userId: user.id },
      orderBy: { lastEarned: { sort: "desc", nulls: "last" } },
      take: 12,
      select: { game: { select: { id: true, slug: true, title: true, coverHue: true, iconUrl: true, screenshots: true } } },
    }),
    // Candidates for the Trophy Vault: the member's rarest earned trophies.
    prisma.userTrophy.findMany({
      where: { userId: user.id },
      orderBy: { trophy: { earnedRate: { sort: "asc", nulls: "last" } } },
      take: 100,
      select: { trophy: { select: { id: true, name: true, type: true, earnedRate: true, game: { select: { title: true } } } } },
    }),
    prisma.vaultTrophy.findMany({ where: { userId: user.id }, orderBy: { position: "asc" }, select: { trophyId: true } }),
  ]);
  const demo = isDemoMode();
  const plan = planOf(user);
  const nextAuto = psn?.lastSyncedAt ? new Date(psn.lastSyncedAt.getTime() + plan.autoEveryMs) : null;
  // A sync is running, or a big import is between runs: the page refreshes itself until it settles.
  const latest = jobs[0];
  const busy =
    !!latest &&
    ((latest.status === "RUNNING" && Date.now() - latest.startedAt.getTime() < 10 * 60_000) ||
      (latest.remaining > 0 && Date.now() - latest.startedAt.getTime() < 2 * 60_000));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Account" title="Settings">
        Your PSN link, profile, privacy and account data.
      </PageHeader>

      {isDemoAccount(user) && (
        <Notice tone="warn" className="mb-6">
          You&apos;re using the shared demo account. Anyone can log in to it, so linking PSN and deleting the account are switched
          off.{" "}
          <Link href="/register" className="underline underline-offset-4">
            Create your own account
          </Link>{" "}
          to link your PSN.
        </Notice>
      )}

      {welcome && (
        <Notice tone="good" className="mb-6">
          Welcome to {SITE.name}, {user.username}. Link your PSN account below to import your trophies.
        </Notice>
      )}

      <div className="space-y-6">
        <Section id="psn" title="PlayStation Network">
          <p className="mb-5 text-sm text-muted">
            Sony doesn&apos;t let other sites sign you in with PSN, so we check that the account is yours with a one-time code in
            your PSN About Me. You can delete the code once you&apos;re verified.
          </p>

          {demo && (
            <Notice tone="warn" className="mb-5">
              Demo mode: verification always succeeds and trophies are simulated. The operator needs to set PSN_NPSSO to use real
              PSN data.
            </Notice>
          )}

          {!psn && <LinkPsnForm />}

          {psn && !psn.verified && (
            <div className="space-y-5">
              <ol className="space-y-4 text-sm">
                <li>
                  <span className="mr-2 text-muted">1.</span>
                  Copy this code:
                  <div className="mt-2 inline-block select-all border border-accent-text px-4 py-2 text-lg font-bold tracking-widest text-accent-text">
                    {psn.verificationCode}
                  </div>
                </li>
                <li>
                  <span className="mr-2 text-muted">2.</span>
                  Paste it anywhere in your About Me. On PS5 that&apos;s Profile, then Edit Profile, then About Me. The
                  PlayStation App works too.
                </li>
                <li>
                  <span className="mr-2 text-muted">3.</span>
                  Save, wait a few seconds, then verify <strong>{psn.onlineId}</strong>:
                </li>
              </ol>
              <VerifyPsnButton />
              <details className="text-sm text-muted">
                <summary className="cursor-pointer hover:text-text">Wrong Online ID?</summary>
                <div className="mt-3">
                  <LinkPsnForm current={psn.onlineId} />
                </div>
              </details>
            </div>
          )}

          {psn?.verified && (
            <div className="space-y-5">
              {linked && (
                <Notice tone={jobs[0]?.status === "FAILED" ? "bad" : "good"}>
                  {jobs[0]?.status === "FAILED"
                    ? `PSN verified, but the first sync failed: ${jobs[0].error}. Try Sync now.`
                    : !jobs[0] || jobs[0].status === "RUNNING" || jobs[0].remaining > 0
                      ? "PSN verified. Your trophies are importing in the background. Big libraries take a few minutes, so refresh this page to see progress."
                      : `PSN verified and fully imported.`}{" "}
                  <Link href={`/u/${user.username}`} className="font-semibold underline underline-offset-4">
                    See your profile
                  </Link>
                </Notice>
              )}
              <div className="flex flex-wrap items-center gap-4 border border-line p-4">
                <Avatar name={psn.onlineId} hue={user.avatarHue} url={psn.avatarUrl} size={48} />
                <div className="flex-1">
                  <div className="font-semibold">{psn.onlineId}</div>
                  <div className="text-xs text-muted">
                    Verified · {psn.lastSyncedAt ? `last synced ${timeAgo(psn.lastSyncedAt)}` : "never synced"}
                  </div>
                </div>
                <Link href={`/u/${user.username}`} className="btn-ghost">
                  View profile
                </Link>
              </div>
              <p className="text-xs text-muted">
                {plan.label} plan: your trophies sync automatically {everyText(plan.autoEveryMs)}
                {nextAuto && (nextAuto.getTime() > Date.now() ? ` (next in about ${durationText(nextAuto.getTime() - Date.now())})` : " (due now)")}
                , and you can press Sync now {everyText(plan.manualEveryMs)}.
              </p>
              {busy && jobs[0] && jobs[0].remaining > 0 && (
                <div className="rounded-lg border border-line p-4" aria-live="polite">
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-semibold">Importing your library</span>
                    <span className="tabular-nums text-muted">
                      {imported.toLocaleString("en-GB")} of {(imported + jobs[0].remaining).toLocaleString("en-GB")} games
                    </span>
                  </div>
                  <ProgressBar value={(imported / (imported + jobs[0].remaining)) * 100} label="Library import" />
                  <p className="mt-2 text-xs text-muted">
                    Your most recently played games come first, so your profile fills in while the rest import. You can leave this page.
                  </p>
                </div>
              )}
              <SyncButton nextAt={nextManual?.toISOString() ?? null} busy={busy} />
              {jobs.length > 0 && (
                <div>
                  <h3 className="label">Recent syncs</h3>
                  <ul className="divide-y divide-line border border-line text-sm">
                    {jobs.map((j) => (
                      <li key={j.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span
                          className={clsx(
                            "w-16 text-xs font-semibold uppercase",
                            j.status === "SUCCESS" ? "text-good" : j.status === "FAILED" ? "text-bad" : "text-gold",
                          )}
                        >
                          {j.status === "SUCCESS" ? "ok" : j.status === "FAILED" ? "failed" : "running"}
                        </span>
                        <span className="flex-1">
                          {formatDate(j.startedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {j.error && <span className="block text-xs text-bad">{j.error}</span>}
                        </span>
                        <span className="text-xs text-muted">
                          {j.gamesSynced} games · +{j.trophiesSynced} trophies
                          {j.remaining > 0 && ` · ${j.remaining} left`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <form action={unlinkPsn} className="border-t border-line pt-4">
                <p className="mb-2 text-xs text-muted">Unlinking deletes your synced trophy data. Your guides and tips stay.</p>
                <ConfirmButton message="Unlink your PSN account and delete your synced trophies?">
                  Unlink PSN account
                </ConfirmButton>
              </form>
            </div>
          )}
        </Section>

        <Section title="Appearance">
          <ThemeForm theme={user.theme} />
        </Section>

        <Section id="look" title="Profile look">
          <LookForm
            values={{
              profileCard: user.profileCard,
              profileAccent: user.profileAccent,
              bannerGameId: user.bannerGameId ?? "",
              avatar: user.avatar ?? "",
            }}
            games={recentGames.map((g) => g.game)}
            allGames={myGames.map((g) => g.game)}
            name={user.psn?.verified ? user.psn.onlineId : user.username}
            avatarHue={user.avatarHue}
            psnAvatarUrl={user.psn?.verified ? user.psn.avatarUrl : null}
          />
        </Section>

        <Section title="Profile">
          <ProfileForm
            values={{
              bio: user.bio ?? "",
              country: user.country ?? "",
              youtubeUrl: user.youtubeUrl ?? "",
              twitchUrl: user.twitchUrl ?? "",
              streamUrl: user.streamUrl ?? "",
              allowMessages: user.allowMessages,
            }}
          />
        </Section>

        <Section id="vault" title="The Trophy Vault">
          <VaultForm
            options={vaultOptions.map(({ trophy: t }) => ({ id: t.id, name: t.name, game: t.game.title, type: t.type, rate: t.earnedRate }))}
            picked={vault.map((v) => v.trophyId)}
          />
        </Section>

        <Section title="Privacy">
          <PrivacyForm
            visibility={user.profileVisibility}
            showOnLeaderboards={user.showOnLeaderboards}
            showActivity={user.showActivity}
          />
        </Section>

        <Section title="Your data">
          <p className="mb-4 text-sm text-muted">
            Download a copy of everything we store about you as JSON. The{" "}
            <Link href="/privacy" className="link">
              privacy policy
            </Link>{" "}
            explains what we keep and why.
          </p>
          <a href="/api/account/export" className="btn-ghost" download>
            Download my data
          </a>
        </Section>

        <Section title="Delete account" danger>
          <p className="mb-4 text-sm text-muted">
            This permanently deletes your account, synced trophies, friends, guides, tips and sessions. It can&apos;t be undone.
          </p>
          <DeleteAccountForm username={user.username} />
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, danger, children }: { id?: string; title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={clsx("card scroll-mt-20 p-5 sm:p-6", danger && "border-bad/40")}>
      <h2 className={clsx("mb-4 text-sm font-bold uppercase tracking-wider", danger && "text-bad")}>{title}</h2>
      {children}
    </section>
  );
}
