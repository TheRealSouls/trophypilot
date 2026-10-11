"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTip } from "@/actions/community";
import { SubmitButton } from "./client";
import { FormMessage } from "./ui";
import { RichTextArea } from "./RichTextArea";

export function TipForm({ trophyId, guideId, path }: { trophyId?: string; guideId?: string; path: string }) {
  const [state, action] = useActionState(addTip, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="card space-y-3 p-4">
      <input type="hidden" name="trophyId" value={trophyId ?? ""} />
      <input type="hidden" name="guideId" value={guideId ?? ""} />
      <input type="hidden" name="path" value={path} />
      <label htmlFor="tip-body" className="label">Share a tip</label>
      <RichTextArea id="tip-body" name="body" rows={3} maxLength={1000} required minLength={10} className="input" placeholder="What helped you earn it? Mark spoilers clearly." />
      <FormMessage state={state} />
      <SubmitButton>Post tip</SubmitButton>
    </form>
  );
}
