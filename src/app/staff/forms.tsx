"use client";

import { useActionState } from "react";
import { deleteMemberAccount, saveForumRules, suspendMember, warnMember } from "@/actions/staff";
import { SubmitButton } from "@/components/client";
import { FormMessage } from "@/components/ui";

export function WarnForm({ userId, username }: { userId: string; username: string }) {
  const [state, action] = useActionState(warnMember, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <label className="label" htmlFor={`warn-${userId}`}>
        Warn {username}
      </label>
      <textarea id={`warn-${userId}`} name="message" rows={2} maxLength={1000} required className="input" placeholder="What they did and what to change" />
      <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">Send warning</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function SuspendForm({ userId, username, maxDays }: { userId: string; username: string; maxDays: number }) {
  const [state, action] = useActionState(suspendMember, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <span className="label">Suspend {username}</span>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`days-${userId}`}>
          Days
        </label>
        <select id={`days-${userId}`} name="days" defaultValue="1" className="input w-auto py-1.5">
          {[1, 3, 7, 14, 30, 90, 365]
            .filter((d) => d <= maxDays)
            .map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? "" : "s"}
              </option>
            ))}
        </select>
        <label className="sr-only" htmlFor={`reason-${userId}`}>
          Reason
        </label>
        <input id={`reason-${userId}`} name="reason" required maxLength={500} placeholder="Reason, shown to the member" className="input min-w-48 flex-1 py-1.5" />
      </div>
      <SubmitButton className="btn-danger px-3 py-1.5 text-xs">Suspend</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DeleteAccountForm({ userId, username }: { userId: string; username: string }) {
  const [state, action] = useActionState(deleteMemberAccount, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <label className="label text-bad" htmlFor={`del-${userId}`}>
        Delete {username}&apos;s account for good (owner only)
      </label>
      <p className="text-xs text-muted">Everything they posted goes with it. This can&apos;t be undone. Type their username to confirm.</p>
      <div className="flex flex-wrap gap-2">
        <input id={`del-${userId}`} name="confirm" autoComplete="off" placeholder={username} className="input w-48 py-1.5" />
        <SubmitButton className="btn-danger px-3 py-1.5 text-xs">Delete account</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function RulesForm({ rules }: { rules: string }) {
  const [state, action] = useActionState(saveForumRules, null);
  return (
    <form action={action} className="space-y-3">
      <label className="label" htmlFor="forum-rules">
        Forum rules
      </label>
      <p className="text-xs text-muted">
        One rule per block, with a blank line between rules. The first line of each block is the rule&apos;s title; the rest is its
        explanation (formatting works).
      </p>
      <textarea id="forum-rules" name="rules" rows={20} defaultValue={rules} className="input font-mono text-xs" />
      <SubmitButton>Save rules</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
