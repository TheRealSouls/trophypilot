import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { conversationName } from "@/lib/community";
import { plainText } from "@/lib/rich-text";
import { timeAgo } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { ConversationLink, ListOnPhones } from "./ConversationLink";

/**
 * Direct messages, laid out like a chat app: your conversations on the left,
 * the open one (or "New message") on the right. On phones the list and the
 * conversation are separate screens.
 */
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Signed-out visitors get the page's own login redirect.
  if (!user) return <>{children}</>;
  const memberships = await prisma.conversationMember.findMany({
    where: { userId: user.id },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: 100,
    include: {
      conversation: {
        include: {
          members: {
            include: {
              user: { select: { id: true, username: true, avatarHue: true, avatar: true, psn: { select: { onlineId: true, avatarUrl: true } } } },
            },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorId: true } },
        },
      },
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="min-w-0">
        <ListOnPhones>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">Messages</h1>
          <Link href="/messages" className="btn-primary px-3 py-1.5 text-xs">
            New message
          </Link>
        </div>
        {memberships.length === 0 ? (
          <p className="card p-4 text-sm text-muted">No conversations yet. Start one with New message, or with the Message button on a profile.</p>
        ) : (
          <nav aria-label="Conversations">
            <ul className="card max-h-[70vh] divide-y divide-line overflow-y-auto">
              {memberships.map(({ conversation: c, lastReadAt }) => {
                const unread = c.lastMessageAt > lastReadAt;
                const last = c.messages[0];
                const other = c.members.find((m) => m.userId !== user.id)?.user;
                const name = conversationName(c, user.id);
                return (
                  <li key={c.id}>
                    <ConversationLink href={`/messages/${c.id}`}>
                      {c.isGroup || !other ? (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-3 text-xs font-bold text-muted" aria-hidden>
                          {c.members.length}
                        </span>
                      ) : (
                        <Avatar name={other.psn?.onlineId ?? other.username} hue={other.avatarHue} url={other.psn?.avatarUrl} avatar={other.avatar} size={36} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block truncate text-sm", unread ? "font-bold" : "font-semibold")}>
                          {name}
                          {unread && <span className="sr-only"> (unread)</span>}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {last ? `${last.authorId === user.id ? "You: " : ""}${plainText(last.body)}` : "No messages yet"}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</span>
                        {unread && <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />}
                      </span>
                    </ConversationLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
        <p className="mt-3 text-xs text-muted">
          Choose who can message you in <Link href="/settings" className="link">Settings</Link>.
        </p>
        </ListOnPhones>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
