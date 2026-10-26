import type { Metadata } from "next";
import Link from "next/link";
import { ReportButton } from "@/components/ReportButton";
import { RichText } from "@/components/RichText";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { blockBetween, blockedByMe } from "@/lib/blocks";
import { conversationName } from "@/lib/community";
import { leaveConversation } from "@/actions/messages";
import { toggleBlock } from "@/actions/blocks";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { LocalTime } from "@/components/LocalTime";
import { Avatar } from "@/components/ui";
import { LiveRefresh, ReplyBox, ScrollToEnd } from "../forms";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

/** How many of the newest messages a conversation page shows. */
const SHOWN = 200;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: { id: true, username: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true } } } } } },
        },
      },
    },
  });
  // Only its members can open a conversation; everyone else gets "not found".
  if (!membership) notFound();
  const c = membership.conversation;
  // The other person in a one-to-one conversation, if they haven't left.
  const other = !c.isGroup && !c.system ? c.members.find((m) => m.userId !== user.id)?.user : undefined;
  const otherName = other ? (other.psn?.onlineId ?? other.username) : "";

  const [messages, block, hidden] = await Promise.all([
    prisma.message
      .findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "desc" },
        take: SHOWN,
        include: { author: { select: { id: true, username: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true } } } } },
      })
      .then((m) => m.reverse()),
    other ? blockBetween(user.id, other.id) : null,
    c.isGroup ? blockedByMe(user.id) : new Set<string>(),
  ]);
  // Opening the conversation marks it read.
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  return (
    <section className="card flex flex-col" aria-label="Conversation">
      <LiveRefresh />
      <nav className="border-b border-line px-4 py-2 text-sm lg:hidden">
        <Link href="/messages" className="text-muted hover:text-text">
          ← All conversations
        </Link>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold tracking-tight">
            {c.system ? "TrophyPilot" : other ? (
              <Link href={`/u/${other.username}`} className="hover:underline hover:underline-offset-4">
                {otherName}
              </Link>
            ) : (
              conversationName(c, user.id)
            )}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {c.system ? (
              "Notices about your account and clubs. You can't reply here."
            ) : (
              <>
                {c.isGroup ? "Group chat with " : "Private conversation with "}
                {c.members
                  .filter((m) => m.userId !== user.id)
                  .map((m, i, all) => (
                    <span key={m.userId}>
                      <Link href={`/u/${m.user.username}`} className="underline underline-offset-2 hover:text-text">
                        {m.user.psn?.onlineId ?? m.user.username}
                      </Link>
                      {i < all.length - 1 ? ", " : ""}
                    </span>
                  ))}
                {c.members.length === 1 && "nobody else (they left)"}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {other && (
            <>
              <Link href={`/u/${other.username}`} className="btn-ghost px-3 py-1.5 text-xs">
                Profile
              </Link>
              <ReportButton type="USER" id={other.id} what={otherName} label="Report" className="px-1" />
              <form action={toggleBlock}>
                <input type="hidden" name="userId" value={other.id} />
                {block === "YOU" ? (
                  <>
                    <input type="hidden" name="block" value="0" />
                    <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">Unblock</SubmitButton>
                  </>
                ) : (
                  <ConfirmButton
                    message={`Block ${otherName}? Neither of you will be able to message, friend or follow the other. They won't be told.`}
                    className="btn-ghost px-3 py-1.5 text-xs hover:text-bad"
                  >
                    Block
                  </ConfirmButton>
                )}
              </form>
            </>
          )}
          <form action={leaveConversation}>
            <input type="hidden" name="conversationId" value={c.id} />
            <ConfirmButton message="Leave this conversation? You won't see it or get its messages any more." className="btn-ghost px-3 py-1.5 text-xs">
              {c.system ? "Delete" : "Leave"}
            </ConfirmButton>
          </form>
        </div>
      </header>

      <ScrollToEnd count={messages.length} className="max-h-[60vh] min-h-64 overflow-y-auto px-4 py-4 sm:px-5">
        <ol className="space-y-3" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.author?.id === user.id;
            if (m.author && hidden.has(m.author.id)) {
              return (
                <li key={m.id} className="text-xs text-muted">
                  A message from someone you blocked is hidden.
                </li>
              );
            }
            const name = m.author ? (m.author.psn?.onlineId ?? m.author.username) : c.system ? "TrophyPilot" : "deleted user";
            const avatar = <Avatar name={name} hue={m.author?.avatarHue ?? 0} url={m.author?.psn?.avatarUrl} avatar={m.author?.avatar} size={32} />;
            return (
              <li key={m.id} className={clsx("flex gap-3", mine && "flex-row-reverse")}>
                {m.author && !mine ? (
                  <Link href={`/u/${m.author.username}`} aria-label={`${name}'s profile`} className="shrink-0 self-start">
                    {avatar}
                  </Link>
                ) : (
                  avatar
                )}
                <div className={clsx("max-w-[80%] rounded-xl border px-3 py-2", mine ? "border-accent-text/40 bg-surface-2" : "border-line bg-surface")}>
                  <div className="mb-0.5 flex flex-wrap items-baseline gap-2 text-xs text-muted">
                    {m.author && !mine ? (
                      <Link href={`/u/${m.author.username}`} className="font-semibold text-text hover:underline hover:underline-offset-2">
                        {name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-text">{mine ? "You" : name}</span>
                    )}
                    <LocalTime date={m.createdAt} />
                    {!mine && m.author && <ReportButton type="MESSAGE" id={m.id} authorId={m.author.id} what={`message from ${name}`} />}
                  </div>
                  <RichText text={m.body} />
                </div>
              </li>
            );
          })}
          {messages.length === 0 && <li className="text-sm text-muted">No messages yet. Say hello.</li>}
        </ol>
      </ScrollToEnd>

      {!c.system && (
        <div className="border-t border-line p-3 sm:p-4">
          {block === "YOU" ? (
            <p className="text-sm text-muted">You&apos;ve blocked {otherName}. Unblock them to send messages.</p>
          ) : (
            <ReplyBox conversationId={c.id} />
          )}
        </div>
      )}
    </section>
  );
}
