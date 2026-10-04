import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { timeAgo } from "@/lib/utils";
import { voteTip } from "@/actions/community";
import { Avatar } from "./ui";
import { TipForm } from "./TipForm";

/** Community tips for a trophy or a guide, sorted by score. */
export async function Tips({ trophyId, guideId, path }: { trophyId?: string; guideId?: string; path: string }) {
  const viewerId = await getSessionUserId();
  const tips = await prisma.tip.findMany({
    where: trophyId ? { trophyId } : { guideId },
    include: { author: { include: { psn: true } }, votes: true },
  });
  const scored = tips
    .map((t) => ({
      ...t,
      score: t.votes.reduce((s, v) => s + v.value, 0),
      mine: t.votes.find((v) => v.userId === viewerId)?.value ?? 0,
    }))
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <section id="tips" className="scroll-mt-24">
      <h2 className="mb-4 text-xl font-bold">Community tips {scored.length > 0 && <span className="text-muted">({scored.length})</span>}</h2>
      <ul className="space-y-3">
        {scored.map((t) => (
          <li key={t.id} className="card flex gap-4 p-4">
            <div className="flex flex-col items-center gap-0.5">
              <VoteButton tipId={t.id} value={1} active={t.mine === 1} path={path} disabled={!viewerId} />
              <span className={clsx("text-sm font-bold tabular-nums", t.score > 0 ? "text-good" : t.score < 0 ? "text-bad" : "text-muted")}>
                {t.score}
              </span>
              <VoteButton tipId={t.id} value={-1} active={t.mine === -1} path={path} disabled={!viewerId} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-relaxed">{t.body}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                <Avatar name={t.author.username} hue={t.author.avatarHue} url={t.author.psn?.avatarUrl} avatar={t.author.avatar} size={20} />
                <Link href={`/u/${t.author.username}`} className="font-semibold hover:text-text">
                  {t.author.psn?.onlineId ?? t.author.username}
                </Link>
                · {timeAgo(t.createdAt)}
              </div>
            </div>
          </li>
        ))}
        {scored.length === 0 && <li className="text-sm text-muted">No tips yet. If you've earned this, share how.</li>}
      </ul>
      <div className="mt-5">
        {viewerId ? (
          <TipForm trophyId={trophyId} guideId={guideId} path={path} />
        ) : (
          <p className="text-sm text-muted">
            <Link href={`/login?next=${encodeURIComponent(path)}`} className="link">Log in</Link> to share a tip or vote.
          </p>
        )}
      </div>
    </section>
  );
}

function VoteButton({ tipId, value, active, path, disabled }: { tipId: string; value: 1 | -1; active: boolean; path: string; disabled: boolean }) {
  return (
    <form action={voteTip}>
      <input type="hidden" name="tipId" value={tipId} />
      <input type="hidden" name="value" value={value} />
      <input type="hidden" name="path" value={path} />
      <button
        disabled={disabled}
        aria-label={value === 1 ? "Upvote" : "Downvote"}
        aria-pressed={active}
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-sm text-xs disabled:opacity-40",
          active ? (value === 1 ? "bg-good/20 text-good" : "bg-bad/20 text-bad") : "text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        {value === 1 ? "▲" : "▼"}
      </button>
    </form>
  );
}
