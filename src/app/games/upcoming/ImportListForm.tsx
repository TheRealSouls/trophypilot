"use client";

import { useActionState } from "react";
import { importListById } from "@/actions/catalogue";
import { SubmitButton } from "@/components/client";
import { FormMessage } from "@/components/ui";

export function ImportListForm() {
  const [state, action] = useActionState(importListById, null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex max-w-md gap-2">
        <label htmlFor="npwr" className="sr-only">
          Trophy list id
        </label>
        <input id="npwr" name="npwr" required placeholder="NPWR12345_00" pattern="[Nn][Pp][Ww][Rr]\d{5}_\d{2}" className="input" spellCheck={false} />
        <SubmitButton pendingText="Fetching…">Add list</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
