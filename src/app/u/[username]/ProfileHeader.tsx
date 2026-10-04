import Link from "next/link";
import { addFriend, removeFriend, respondToRequest } from "@/actions/friends";
import { toggleFollow } from "@/actions/social";
import { prisma } from "@/lib/db";
import { reputationOf } from "@/lib/community";
import { COUNTRIES, flag } from "@/lib/countries";
import clsx from "clsx";
import { PROFILE_CARDS, bannerImage, cardClass } from "@/lib/profile-themes";
import { ProfileCardArt } from "@/components/ProfileCardArt";
import type { FriendState } from "@/lib/social";
import type { UserStats } from "@/lib/stats";
import { formatDate, formatNumber, timeAgo } from "@/lib/utils";
import { SceneArt } from "@/components/art";
import { TrophyCounts } from "@/components/TrophyIcon";
import { Avatar, LevelMeter, Stat, StatGrid } from "@/components/ui";
import { ConfirmButton, SubmitButton } from "@/components/client";
import type { ProfileOwner } from "./profile-data";

export async function ProfileHeader({
  owner,
  stats,
  relation,
  viewerId,
}: {
  owner: ProfileOwner;
  stats: UserStats | null;
  relation: FriendState;
  viewerId: string | null;
}) {
  const display = owner.psn?.verified ? owner.psn.onlineId : owner.username;
  // A real PSN sync stores Sony's own level; otherwise fall back to our estimate from synced trophies.
  const psnLevel = owner.psn?.verified && owner.psn.trophyLevel > 1 ? owner.psn : null;
  const level = psnLevel?.trophyLevel ?? stats?.level ?? 1;
  const progress = psnLevel?.levelProgress ?? stats?.progress ?? 0;

  const [incoming, followers, following, iFollow, rep] = await Promise.all([
    relation === "INCOMING"
      ? prisma.friendship.findFirst({ where: { requesterId: owner.id, addresseeId: viewerId!, status: "PENDING" } })
      : null,
    prisma.follow.count({ where: { followingId: owner.id } }),
    prisma.follow.count({ where: { followerId: owner.id } }),
    viewerId && relation !== "SELF"
      ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: owner.id } } })
      : null,
    reputationOf(owner.id),
  ]);

  const banner = bannerImage(owner.bannerGame);
  const card = owner.profileCard && owner.profileCard in PROFILE_CARDS ? owner.profileCard : "";
  // A game banner wins; otherwise a card brings its own art.
  const hasBanner = !!owner.bannerGame || !!card;
  const isOwner = relation === "SELF";
  const playing = owner.nowPlayingGame && owner.nowPlayingUntil && owner.nowPlayingUntil > new Date() ? owner.nowPlayingGame : null;
  const links = [
    ["YouTube", owner.youtubeUrl],
    ["Twitch", owner.twitchUrl],
    ["Stream", owner.streamUrl],
  ].filter((l): l is [string, string] => !!l[1]);

  return (
    <section className={clsx("card relative mb-8 overflow-hidden", cardClass(card))}>
      {hasBanner && (
        <div className="relative h-32 overflow-hidden bg-surface-3 sm:h-44">
          {owner.bannerGame ? (
            banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              // Demo games have generated art instead of real screenshots.
              <SceneArt seed={`${owner.bannerGame.slug}-banner`} hue={owner.bannerGame.coverHue} className="h-full w-full rounded-none border-0" />
            )
          ) : (
            <ProfileCardArt card={card} part="banner" />
          )}
          {owner.bannerGame && (
            <span className="absolute bottom-2 right-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">{owner.bannerGame.title}</span>
          )}
          {isOwner && (
            <Link href="/settings#look" className="absolute right-3 top-3 rounded-md bg-black/65 px-2.5 py-1 text-xs font-semibold text-white hover:bg-black/80">
              Change banner and card
            </Link>
          )}
        </div>
      )}
      {isOwner && !hasBanner && (
        <Link
          href="/settings#look"
          className="flex h-14 items-center justify-center gap-2 border-b border-dashed border-line-strong bg-surface-2 text-sm font-semibold text-muted hover:text-text"
        >
          Add a banner or a profile card theme
        </Link>
      )}
      <ProfileCardArt card={card} part="body" />
      <div className="relative flex flex-wrap items-start gap-5 p-5 sm:p-6">
        <div className={clsx("relative shrink-0", hasBanner && "-mt-14 sm:-mt-16")}>
          <Avatar
            name={display}
            hue={owner.avatarHue}
            url={owner.psn?.avatarUrl}
            avatar={owner.avatar}
            size={96}
            className={hasBanner ? "border-4 border-surface" : "border border-line"}
          />
          {isOwner && (
            <Link
              href="/settings#look"
              aria-label="Change profile picture"
              className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-accent text-white hover:bg-accent-hi"
            >
              <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden>
                <path d="M13.5 3.5l3 3L7 16H4v-3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 break-all text-2xl font-bold tracking-tight sm:text-3xl">
            {display}
            {owner.country && (
              <span className="text-xl" title={COUNTRIES[owner.country]}>
                {flag(owner.country)}
              </span>
            )}
            {owner.profileVisibility !== "PUBLIC" && (
              <span className="chip">{owner.profileVisibility === "FRIENDS" ? "Friends only" : "Private"}</span>
            )}
            {owner.role === "ADMIN" && <span className="chip border-accent-text/50 text-accent-text">Staff</span>}
          </h1>
          <div className="mt-1 text-xs text-muted">
            @{owner.username} · joined {formatDate(owner.createdAt, { month: "short", year: "numeric" })}
            {owner.psn?.lastSyncedAt && <> · synced {timeAgo(owner.psn.lastSyncedAt)}</>} ·{" "}
            <strong className="font-semibold text-text">{formatNumber(followers)}</strong> follower{followers === 1 ? "" : "s"} ·{" "}
            <strong className="font-semibold text-text">{formatNumber(following)}</strong> following
          </div>
          {playing && (
            <p className="mt-3 text-sm">
              <span className="chip mr-2 border-good/50 text-good">Playing now</span>
              <Link href={`/games/${playing.slug}`} className="font-semibold underline underline-offset-4">
                {playing.title}
              </Link>
            </p>
          )}
          {owner.bio && <p className="mt-3 max-w-2xl text-sm text-text/90">{owner.bio}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Link href={`/forums/user/${owner.username}`} className="chip hover:text-text" title="Community reputation">
              {rep.rank} · {formatNumber(rep.points)} rep · forum profile
            </Link>
            {links.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="chip hover:text-text">
                {label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {isOwner && (
            <>
              <Link href="/settings#look" className="btn-ghost">Customise look</Link>
              <Link href="/settings" className="btn-ghost">Edit profile</Link>
            </>
          )}
          {relation !== "SELF" && viewerId && (
            <form action={toggleFollow}>
              <input type="hidden" name="userId" value={owner.id} />
              <SubmitButton className={iFollow ? "btn-ghost" : "btn-primary"}>{iFollow ? "Following" : "Follow"}</SubmitButton>
            </form>
          )}
          {relation !== "SELF" && viewerId && owner.allowMessages !== "NOBODY" && (
            <Link href={`/messages?to=${owner.username}`} className="btn-ghost">Message</Link>
          )}
          {relation !== "SELF" && (
            <Link href={`/compare?b=${owner.username}`} className="btn-ghost">Compare</Link>
          )}
          {relation === "NONE" && viewerId && (
            <form action={addFriend}>
              <input type="hidden" name="username" value={owner.username} />
              <SubmitButton className="btn-ghost">Add friend</SubmitButton>
            </form>
          )}
          {relation === "NONE" && !viewerId && (
            <Link href={`/login?next=/u/${owner.username}`} className="btn-primary">Follow or add friend</Link>
          )}
          {relation === "OUTGOING" && <span className="btn-ghost cursor-default">Request sent</span>}
          {relation === "INCOMING" && incoming && (
            <form action={respondToRequest}>
              <input type="hidden" name="id" value={incoming.id} />
              <input type="hidden" name="accept" value="1" />
              <SubmitButton>Accept friend request</SubmitButton>
            </form>
          )}
          {relation === "FRIENDS" && (
            <form action={removeFriend}>
              <input type="hidden" name="userId" value={owner.id} />
              <ConfirmButton message={`Remove ${owner.username} from your friends?`} className="btn-ghost">
                Friends
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>

      {stats && (
        <>
          <div className="relative flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-line px-5 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="text-[11px] uppercase tracking-wider text-muted">Level</span>
              <span className="text-2xl font-bold tabular-nums">{level}</span>
              <LevelMeter level={level} progress={progress} detail={`${formatNumber(stats.points)} pts`} className="w-40" />
            </div>
            <TrophyCounts {...stats} size={18} className="flex-wrap" />
          </div>
          <StatGrid className="relative -mx-px -mb-px grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Trophies" value={formatNumber(stats.total)} />
            <Stat label="Games" value={stats.games} />
            <Stat label="Platinums" value={stats.platinum} />
            <Stat label="100% games" value={stats.completed} />
            <Stat label="Avg completion" value={`${stats.avgCompletion}%`} />
            <Stat label="Ultra rares" value={stats.ultraRare} />
          </StatGrid>
        </>
      )}
    </section>
  );
}
