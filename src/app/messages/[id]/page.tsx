import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { conversationName } from "@/lib/community";
import { leaveConversation } from "@/actions/messages";
import { ConfirmButton } from "@/components/client";
import { LocalTime } from "@/components/LocalTime";
import { Avatar } from "@/components/ui";
import { LiveRefresh, ReplyBox } from "../forms";

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

  const messages = (
    await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: SHOWN,
      include: { author: { select: { id: true, username: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true } } } } },
    })
  ).reverse();
  // Opening the conversation marks it read.
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <LiveRefresh />
      <nav className="mb-4 text-sm text-muted">
        <Link href="/messages" className="hover:text-text">Messages</Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight">{conversationName(c, user.id)}</h1>
          <p className="mt-1 text-sm text-muted">
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
          </p>
        </div>
        <form action={leaveConversation}>
          <input type="hidden" name="conversationId" value={c.id} />
          <ConfirmButton message="Leave this conversation? You won't see it or get its messages any more." className="btn-ghost px-3 py-1.5 text-xs">
            Leave
          </ConfirmButton>
        </form>
      </header>

      <ol className="mb-6 space-y-3" aria-label="Messages">
        {messages.map((m) => {
          const mine = m.author?.id === user.id;
          const name = m.author ? (m.author.psn?.onlineId ?? m.author.username) : "deleted user";
          return (
            <li key={m.id} className={clsx("flex gap-3", mine && "flex-row-reverse")}>
              <Avatar name={name} hue={m.author?.avatarHue ?? 0} url={m.author?.psn?.avatarUrl} avatar={m.author?.avatar} size={32} />
              <div className={clsx("max-w-[80%] rounded-xl border px-3 py-2", mine ? "border-accent-text/40 bg-surface-2" : "border-line bg-surface")}>
                <div className="mb-0.5 flex flex-wrap items-baseline gap-2 text-xs text-muted">
                  <span className="font-semibold text-text">{mine ? "You" : name}</span>
                  <LocalTime date={m.createdAt} />
                </div>
                <p className="prose-guide break-words">{m.body}</p>
              </div>
            </li>
          );
        })}
        {messages.length === 0 && <li className="text-sm text-muted">No messages yet.</li>}
      </ol>

      <ReplyBox conversationId={c.id} />
    </div>
  );
}
