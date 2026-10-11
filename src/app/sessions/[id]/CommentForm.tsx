"use client";

import { useActionState, useEffect, useRef } from "react";
import { addSessionComment } from "@/actions/community";
import { SubmitButton } from "@/components/client";
import { FormMessage } from "@/components/ui";
import { RichTextArea } from "@/components/RichTextArea";

export function CommentForm({ sessionId }: { sessionId: string }) {
  const [state, action] = useActionState(addSessionComment, null);
  const ref = useRef<HTMLFormElement>(null);
  // Clear the box once the comment is posted.
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <label htmlFor="session-comment" className="label">
        Add a comment
      </label>
      <RichTextArea id="session-comment" name="body" required minLength={2} maxLength={1000} rows={3} className="input" />
      <FormMessage state={state} />
      <SubmitButton pendingText="Posting…">Post comment</SubmitButton>
    </form>
  );
}
