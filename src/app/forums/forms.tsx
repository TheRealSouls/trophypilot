"use client";

import { useState } from "react";
import { createThread, editPost, replyToThread, saveSection } from "@/actions/forum";
import { SubmitButton, useKeepValuesAction } from "@/components/client";
import { GamePicker, type PickedGame } from "@/components/GamePicker";
import { FormMessage } from "@/components/ui";
import { RichTextArea } from "@/components/RichTextArea";
import { RichText } from "@/components/RichText";

export function ThreadForm({
  sections,
  sectionId,
  initialGame,
}: {
  sections: { id: string; label: string }[];
  sectionId: string;
  initialGame: PickedGame | null;
}) {
  const [state, form] = useKeepValuesAction(createThread, null);
  return (
    <form {...form} className="card space-y-4 p-5">
      <div>
        <label htmlFor="t-section" className="label">Section</label>
        <select id="t-section" name="sectionId" defaultValue={sectionId} required className="input">
          <option value="" disabled>Choose a section</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="t-title" className="label">Title</label>
        <input id="t-title" name="title" required minLength={4} maxLength={120} className="input" />
      </div>
      <GamePicker name="gameId" label="Game (optional)" initial={initialGame} />
      <div>
        <label htmlFor="t-body" className="label">Post</label>
        <RichTextArea id="t-body" name="body" required minLength={2} maxLength={10_000} rows={10} className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Posting…">Post thread</SubmitButton>
    </form>
  );
}

export function ReplyForm({ threadId }: { threadId: string }) {
  const [state, form] = useKeepValuesAction(replyToThread, null);
  return (
    <form {...form} className="space-y-3">
      <input type="hidden" name="threadId" value={threadId} />
      <label htmlFor="reply" className="label">Reply</label>
      <RichTextArea id="reply" name="body" required minLength={2} maxLength={10_000} rows={6} className="input" />
      <FormMessage state={state} />
      <SubmitButton pendingText="Posting…">Post reply</SubmitButton>
    </form>
  );
}

/** Shows the post text, and swaps it for an editor when its author (or an admin) clicks Edit. */
export function EditablePost({ postId, body, canEdit }: { postId: string; body: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, form] = useKeepValuesAction(editPost, null);
  if (!editing) {
    return (
      <div>
        <RichText text={body} />
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className="mt-3 text-xs text-muted hover:text-text">
            Edit
          </button>
        )}
      </div>
    );
  }
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="postId" value={postId} />
      <RichTextArea name="body" defaultValue={body} required maxLength={10_000} rows={8} className="input" aria-label="Edit post" />
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
        <button type="button" onClick={() => setEditing(false)} className="btn-ghost">Close</button>
      </div>
    </form>
  );
}

export type SectionValues = { id?: string; name: string; description: string; parentId: string; order: number; adminOnly: boolean };

/** Create a section, or edit one when `section.id` is set. */
export function SectionForm({ section, parents }: { section?: SectionValues; parents: { id: string; name: string }[] }) {
  const [state, form] = useKeepValuesAction(saveSection, null);
  const id = section?.id ?? "new";
  return (
    <form {...form} className="space-y-3">
      {section?.id && <input type="hidden" name="id" value={section.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px]">
        <div>
          <label htmlFor={`name-${id}`} className="label">Name</label>
          <input id={`name-${id}`} name="name" defaultValue={section?.name} required maxLength={60} className="input" />
        </div>
        <div>
          <label htmlFor={`parent-${id}`} className="label">Inside</label>
          <select id={`parent-${id}`} name="parentId" defaultValue={section?.parentId ?? ""} className="input">
            <option value="">Top level (a section)</option>
            {parents
              .filter((p) => p.id !== section?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name} (as a sub-section)</option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor={`order-${id}`} className="label">Order</label>
          <input id={`order-${id}`} name="order" type="number" min={0} max={999} defaultValue={section?.order ?? 0} className="input" />
        </div>
      </div>
      <div>
        <label htmlFor={`desc-${id}`} className="label">Description</label>
        <input id={`desc-${id}`} name="description" defaultValue={section?.description} maxLength={200} className="input" />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="adminOnly" defaultChecked={section?.adminOnly} className="accent-[var(--color-accent)]" />
        Only admins can start threads here
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingText="Saving…">{section?.id ? "Save section" : "Create section"}</SubmitButton>
    </form>
  );
}
