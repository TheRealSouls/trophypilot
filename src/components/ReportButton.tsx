"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import clsx from "clsx";
import { reportContent } from "@/actions/reports";
import { REPORT_REASONS, type ReportType } from "@/lib/reports";
import { useMe } from "./session";
import { SubmitButton } from "./client";
import { FormMessage } from "./ui";

/**
 * "Report" for anything members write: opens a small dialog (a native
 * <dialog>, so focus stays inside and Escape closes it) with a reason and
 * optional details, sent to staff. Only signed-in members see it, and not
 * on their own things.
 */
export function ReportButton({
  type,
  id,
  authorId,
  what = "this",
  label = "Report",
  className,
}: {
  type: ReportType;
  id: string;
  /** The author, so people don't see Report on their own posts. */
  authorId?: string | null;
  /** Read out with the button, e.g. "post by Alex". */
  what?: string;
  /** The button text, "Report" unless the place needs more ("Report member"). */
  label?: string;
  className?: string;
}) {
  const { me } = useMe();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action] = useActionState(reportContent, null);
  const titleId = useId();

  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => dialog.current?.close(), 2000);
    return () => clearTimeout(t);
  }, [state]);

  if (!me) return null;
  if (authorId && authorId === me.id) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={clsx("text-xs text-muted underline-offset-2 hover:text-bad hover:underline", className)}
        aria-label={`Report ${what}`}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="w-[min(92vw,28rem)] rounded-xl border border-line bg-surface p-0 text-text shadow-[var(--shadow-raised)] backdrop:bg-black/50"
      >
        <form action={action} className="space-y-4 p-5">
          <input type="hidden" name="targetType" value={type} />
          <input type="hidden" name="targetId" value={id} />
          <h2 id={titleId} className="text-lg font-bold">
            Report {what}
          </h2>
          <fieldset className="space-y-1.5">
            <legend className="label">What&apos;s wrong?</legend>
            {Object.entries(REPORT_REASONS).map(([key, label], i) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                <input type="radio" name="reason" value={key} required defaultChecked={i === 0} className="accent-[var(--color-accent)]" />
                {label}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor={`${titleId}-details`} className="label">
              Details <span className="normal-case tracking-normal text-faint">(optional)</span>
            </label>
            <textarea id={`${titleId}-details`} name="details" rows={3} maxLength={1000} className="input" />
          </div>
          <p className="text-xs text-muted">Only staff see reports. The person you report isn&apos;t told who reported them.</p>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="btn-ghost">
              {state?.ok ? "Close" : "Cancel"}
            </button>
            {!state?.ok && <SubmitButton pendingText="Sending…">Send report</SubmitButton>}
          </div>
        </form>
      </dialog>
    </>
  );
}
