"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteMemberAccount, saveForumRules, saveGuideRules, saveHomeBackground, suspendMember, warnMember } from "@/actions/staff";
import { uploadPicture } from "@/lib/shrink-image";
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

export function RulesForm({ rules, kind = "forum" }: { rules: string; kind?: "forum" | "guide" }) {
  const [state, action] = useActionState(kind === "forum" ? saveForumRules : saveGuideRules, null);
  return (
    <form action={action} className="space-y-3">
      <label className="label" htmlFor={`${kind}-rules`}>
        {kind === "forum" ? "Forum rules" : "Guide rules (shown beside the guide editor)"}
      </label>
      <p className="text-xs text-muted">
        One rule per block, with a blank line between rules. The first line of each block is the rule&apos;s title; the rest is its
        explanation (formatting works).
      </p>
      <textarea id={`${kind}-rules`} name="rules" rows={kind === "forum" ? 20 : 14} defaultValue={rules} className="input font-mono text-xs" />
      <SubmitButton>Save rules</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** The home page picture for an occasion: an https address, or an upload when uploads are switched on. */
export function HomeBackgroundForm({ url }: { url: string | null }) {
  const [state, action] = useActionState(saveHomeBackground, null);
  const [value, setValue] = useState(url ?? "");
  const [canUpload, setCanUpload] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => setCanUpload(document.body.dataset.uploads === "1"), []);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="home-bg" className="label">
          Picture address
        </label>
        <input id="home-bg" name="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…" className="input" />
        <p className="mt-1 text-xs text-muted">
          A wide picture works best (about 1600 by 900). It sits on the right of the home page and fades into it, so the headline stays readable. Leave it
          empty to show the game covers again.
        </p>
      </div>
      {canUpload && (
        <label className="btn-ghost cursor-pointer">
          Upload a picture
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setNote("Uploading…");
              try {
                setValue(await uploadPicture(file));
                setNote("Uploaded. Press Save to use it.");
              } catch (err) {
                setNote(err instanceof Error ? err.message : "The upload didn't work.");
              }
            }}
          />
        </label>
      )}
      {note && (
        <p className="text-xs text-muted" aria-live="polite">
          {note}
        </p>
      )}
      {/^https:\/\//.test(value) && (
        <div className="overflow-hidden rounded-lg border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview of the home page picture" referrerPolicy="no-referrer" className="aspect-[16/7] w-full object-cover" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton>Save</SubmitButton>
        {url && (
          <button type="submit" name="clear" value="1" className="btn-ghost">
            Back to the game covers
          </button>
        )}
      </div>
      <FormMessage state={state} />
    </form>
  );
}
