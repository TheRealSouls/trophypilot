"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessage, startConversation } from "@/actions/messages";
import { SubmitButton } from "@/components/client";
import { FormMessage } from "@/components/ui";
import { RichTextArea } from "@/components/RichTextArea";

export function NewConversationForm({ to }: { to: string }) {
  const [state, action] = useActionState(startConversation, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="msg-to" className="label">
          To
        </label>
        <MemberInput id="msg-to" name="to" defaultValue={to} />
        <p className="mt-1 text-xs text-muted">Add several names, separated by commas, to start a group chat.</p>
      </div>
      <div>
        <label htmlFor="msg-title" className="label">
          Group name <span className="normal-case tracking-normal text-faint">(group chats only)</span>
        </label>
        <input id="msg-title" name="title" maxLength={60} className="input" />
      </div>
      <div>
        <label htmlFor="msg-body" className="label">
          Message
        </label>
        <RichTextArea id="msg-body" name="body" required maxLength={2000} rows={4} className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Sending…">
        Send
      </SubmitButton>
    </form>
  );
}

/** The reply box at the bottom of a conversation. Clears itself once the message is sent. */
export function ReplyBox({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(sendMessage, null);
  const ref = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) ref.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="reply-body" className="sr-only">
        Write a message
      </label>
      <RichTextArea
        id="reply-body"
        name="body"
        required
        maxLength={2000}
        rows={3}
        className="input"
        placeholder="Write a message…"
        aria-describedby="reply-hint"
        onKeyDown={(e) => {
          // Enter sends, like a chat app; Shift + Enter starts a new line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (e.currentTarget.value.trim()) e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {state?.error && <FormMessage state={state} />}
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Sending…">Send</SubmitButton>
        <span id="reply-hint" className="text-xs text-muted">
          Enter sends · Shift + Enter for a new line
        </span>
      </div>
    </form>
  );
}

/**
 * The "To" box: suggests members as you type (by username or PSN ID). For a
 * group chat, names are separated by commas and the suggestion completes the
 * last one.
 */
function MemberInput({ id, name, defaultValue }: { id: string; name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [options, setOptions] = useState<{ username: string; name: string }[]>([]);
  useEffect(() => {
    const last = value.split(",").pop()?.trim() ?? "";
    if (last.length < 2) {
      setOptions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/members?q=${encodeURIComponent(last)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { members: [] }))
        .then((d: { members: { username: string; name: string }[] }) => setOptions(d.members))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);
  const head = value.includes(",") ? value.slice(0, value.lastIndexOf(",") + 1) + " " : "";
  return (
    <>
      <input
        id={id}
        name={name}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        list={`${id}-members`}
        className="input"
        placeholder="Username or PSN ID"
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id={`${id}-members`}>
        {options.map((o) => (
          <option key={o.username} value={`${head}${o.username}`}>
            {o.name}
          </option>
        ))}
      </datalist>
    </>
  );
}

/** Keeps a chat scrolled to the newest message: on opening, and when one arrives. */
export function ScrollToEnd({ count, className, children }: { count: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(-1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only jump if they were already near the bottom (or it's the first view), so reading older messages isn't interrupted.
    // (Measured after the new message is in, so allow for its height.)
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 400;
    if (seen.current === -1 || (count > seen.current && nearBottom)) el.scrollTop = el.scrollHeight;
    seen.current = count;
  }, [count]);
  return (
    <div ref={ref} className={className} tabIndex={0} role="region" aria-label="Message history">
      {children}
    </div>
  );
}

/** Checks for new messages every few seconds while the conversation is open. */
export function LiveRefresh({ seconds = 6 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
