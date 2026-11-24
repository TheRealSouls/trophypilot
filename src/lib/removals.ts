import { prisma } from "./db";
import { REMOVAL_REASONS, type RemovalReason } from "./removal-reasons";

export { REMOVAL_REASONS, type RemovalReason };


/** The reason and note from a staff delete form, or null when none was picked (an author deleting their own). */
export function removalFrom(fd: FormData): { reason: RemovalReason; note: string } | null {
  const reason = String(fd.get("removalReason") ?? "");
  if (!(reason in REMOVAL_REASONS)) return null;
  return { reason: reason as RemovalReason, note: String(fd.get("removalNote") ?? "").trim().slice(0, 500) };
}

/**
 * Tells a member a moderator removed something of theirs, and why. Skipped when staff removed their
 * own content or the author's account is gone.
 */
export async function notifyRemoval({
  authorId,
  actorId,
  what,
  excerpt,
  url,
  removal,
}: {
  authorId: string | null | undefined;
  actorId: string;
  /** "your forum post in "Best RPGs"", "your comment", "your guide "…"". */
  what: string;
  excerpt?: string | null;
  url?: string | null;
  removal: { reason: RemovalReason; note: string } | null;
}) {
  if (!authorId || authorId === actorId) return;
  const why = removal ? REMOVAL_REASONS[removal.reason] : "Against the community rules";
  const quote = excerpt ? `"${excerpt.replace(/\s+/g, " ").trim().slice(0, 140)}${excerpt.length > 140 ? "…" : ""}"` : null;
  await prisma.notification
    .create({
      data: {
        userId: authorId,
        kind: "REMOVED",
        title: `A moderator removed ${what}`,
        body: [`Reason: ${why}.`, removal?.note ? `Note from the moderator: ${removal.note}` : null, quote].filter(Boolean).join("\n"),
        url: url ?? "/forums/rules",
      },
    })
    .catch((err) => console.error("[notify] removal", err));
}
