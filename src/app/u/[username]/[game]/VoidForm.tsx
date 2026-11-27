"use client";

import { useActionState } from "react";
import { setListVoid } from "@/actions/staff";
import { SubmitButton } from "@/components/client";
import { FormMessage } from "@/components/ui";

/** Staff: void a member's list (with the reason they'll see) or restore it. */
export function VoidForm({ userGameId, voided }: { userGameId: string; voided: boolean }) {
  const [state, action] = useActionState(setListVoid, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userGameId" value={userGameId} />
      {voided ? (
        <>
          <input type="hidden" name="restore" value="1" />
          <SubmitButton className="btn-ghost" pendingText="Restoring…">
            Restore this list
          </SubmitButton>
        </>
      ) : (
        <>
          <label htmlFor="void-reason" className="label">
            Void this list (the member sees the reason)
          </label>
          <textarea
            id="void-reason"
            name="reason"
            rows={2}
            maxLength={500}
            required
            placeholder="For example: 14 unrelated trophies unlocked in the same second on 3 May"
            className="input text-sm"
          />
          <SubmitButton className="btn-danger" pendingText="Voiding…">
            Void list
          </SubmitButton>
        </>
      )}
      <FormMessage state={state} />
    </form>
  );
}
