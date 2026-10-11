import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { LiveRefresh, NewConversationForm } from "./forms";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

/** /messages: the conversation list is in the layout; this side starts a new one. */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const { to = "" } = await searchParams;
  await requireUser("/messages");
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="new-message">
      {/* Keeps the conversation list's unread markers current. */}
      <LiveRefresh seconds={20} />
      <h2 id="new-message" className="mb-1 text-lg font-bold">
        New message
      </h2>
      <p className="mb-5 text-sm text-muted">Send a private message to a member, or add a few names to start a group chat.</p>
      <NewConversationForm to={to} />
    </section>
  );
}
