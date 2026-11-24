"use client";

import { useId, useRef, type ReactNode } from "react";
import clsx from "clsx";
import { useFormStatus } from "react-dom";
import { REMOVAL_REASONS } from "@/lib/removal-reasons";

/**
 * Delete for posts, comments, tips and guides. Authors deleting their own get
 * a plain "are you sure". Staff removing someone else's (`moderating`) pick a
 * reason first, and can add a note; the author sees both in Notifications.
 */
export function DeleteButton({
  action,
  fields,
  confirm,
  what,
  moderating,
  className,
  defaultReason,
  children = "Delete",
}: {
  action: (fd: FormData) => void | Promise<void>;
  /** Hidden inputs, e.g. { postId: "…" }. */
  fields: Record<string, string>;
  /** The question for an author deleting their own, "Delete this comment?". */
  confirm: string;
  /** For the staff dialog title: "comment by Alex". */
  what: string;
  moderating: boolean;
  className?: string;
  /** The reason picked to start with, e.g. the one a report gave. */
  defaultReason?: string;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const hidden = Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);
  const look = className ?? "text-xs text-muted hover:text-bad";

  if (!moderating) {
    return (
      <form action={action} className="inline-flex">
        {hidden}
        <button type="submit" className={look} onClick={(e) => !window.confirm(confirm) && e.preventDefault()}>
          {children}
        </button>
      </form>
    );
  }

  return (
    <>
      <button type="button" className={look} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
        {children}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        className="w-[min(92vw,28rem)] rounded-xl border border-line bg-surface p-0 text-left text-sm text-text shadow-[var(--shadow-raised)] backdrop:bg-black/50"
      >
        <form action={action} onSubmit={() => setTimeout(() => dialog.current?.close(), 0)} className="space-y-4 p-5">
          {hidden}
          <h2 id={`${id}-title`} className="text-lg font-bold">
            Remove {what}
          </h2>
          <fieldset className="space-y-1.5">
            <legend className="label">Reason (the author sees this)</legend>
            {Object.entries(REMOVAL_REASONS).map(([key, label], i) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2">
                <input type="radio" name="removalReason" value={key} required defaultChecked={defaultReason && defaultReason in REMOVAL_REASONS ? key === defaultReason : i === 0} className="accent-[var(--color-accent)]" />
                {label}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor={`${id}-note`} className="label">
              Note to the author <span className="normal-case tracking-normal text-faint">(optional)</span>
            </label>
            <textarea id={`${id}-note`} name="removalNote" rows={3} maxLength={500} className="input" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="btn-ghost">
              Cancel
            </button>
            <RemoveSubmit />
          </div>
        </form>
      </dialog>
    </>
  );
}

function RemoveSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx("btn-danger", pending && "opacity-70")}>
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
