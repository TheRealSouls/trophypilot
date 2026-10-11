"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClub, createPost } from "@/actions/social";
import { SubmitButton } from "./client";
import { FormMessage } from "./ui";
import { RichTextArea } from "./RichTextArea";
import { CardThemePicker } from "./CardThemePicker";

/** Box for posting an update. `clubs` lets the member post into one of their clubs; `clubId` fixes it to one. */
export function PostComposer({ clubs = [], clubId }: { clubs?: { id: string; name: string }[]; clubId?: string }) {
  const [state, action] = useActionState(createPost, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="card space-y-3 p-4">
      <label htmlFor="post-body" className="label">
        {clubId ? "Post to the club" : "Post an update"}
      </label>
      <RichTextArea
        id="post-body"
        name="body"
        required
        minLength={2}
        maxLength={1000}
        rows={3}
        className="input"
        placeholder="A new platinum, a game you're stuck on, a session you're planning…"
      />
      <div className="flex flex-wrap items-center gap-3">
        {clubId ? (
          <input type="hidden" name="clubId" value={clubId} />
        ) : (
          clubs.length > 0 && (
            <>
              <label htmlFor="post-club" className="sr-only">
                Where to post
              </label>
              <select id="post-club" name="clubId" defaultValue="" className="input w-auto py-1.5">
                <option value="">Everyone</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )
        )}
        <SubmitButton pendingText="Posting…">Post</SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}

export function ClubForm() {
  const [state, action] = useActionState(createClub, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="club-name" className="label">
          Club name
        </label>
        <input id="club-name" name="name" required minLength={3} maxLength={50} className="input" placeholder="Online Shooters" />
      </div>
      <div>
        <label htmlFor="club-description" className="label">
          What it&apos;s about
        </label>
        <RichTextArea id="club-description" name="description" maxLength={300} rows={3} className="input" />
      </div>
      <CardThemePicker legend="Club theme" />
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full" pendingText="Creating…">
        Create club
      </SubmitButton>
    </form>
  );
}
