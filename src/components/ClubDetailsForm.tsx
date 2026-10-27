"use client";

import { useActionState, useEffect, useState } from "react";
import clsx from "clsx";
import { saveClubDetails } from "@/actions/social";
import { uploadPicture } from "@/lib/shrink-image";
import { SubmitButton } from "./client";
import { FormMessage } from "./ui";
import { RichTextArea } from "./RichTextArea";

/**
 * The owner's club rules and banner. The banner comes from the owner's own
 * games' artwork, or an uploaded picture when uploads are switched on.
 */
export function ClubDetailsForm({
  clubId,
  rules,
  banner,
  artwork,
}: {
  clubId: string;
  rules: string;
  banner: string | null;
  /** Artwork from the owner's recently played games. */
  artwork: { url: string; title: string }[];
}) {
  const [state, action] = useActionState(saveClubDetails, null);
  const [picked, setPicked] = useState(banner ?? "");
  const [canUpload, setCanUpload] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => setCanUpload(document.body.dataset.uploads === "1"), []);
  const options = [...(banner && !artwork.some((a) => a.url === banner) ? [{ url: banner, title: "Current banner" }] : []), ...artwork];

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="bannerUrl" value={picked} />
      <fieldset>
        <legend className="label">Banner</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setPicked("")}
            aria-pressed={picked === ""}
            className={clsx("flex aspect-[3/1] items-center justify-center rounded-lg border-2 text-xs text-muted", picked === "" ? "border-accent" : "border-line")}
          >
            No banner
          </button>
          {options.map((a) => (
            <button
              key={a.url}
              type="button"
              onClick={() => setPicked(a.url)}
              aria-pressed={picked === a.url}
              aria-label={`Use ${a.title}`}
              className={clsx("overflow-hidden rounded-lg border-2", picked === a.url ? "border-accent" : "border-line")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[3/1] w-full object-cover" />
            </button>
          ))}
        </div>
        {options.length === 0 && <p className="mt-2 text-xs text-muted">Artwork from your synced games shows up here once they have pictures.</p>}
        {canUpload && (
          <label className="btn-ghost mt-3 cursor-pointer">
            Upload a banner
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
                  setPicked(await uploadPicture(file));
                  setNote("Uploaded. Press Save to use it.");
                } catch (err) {
                  setNote(err instanceof Error ? err.message : "The upload didn't work.");
                }
              }}
            />
          </label>
        )}
        {note && (
          <p className="mt-2 text-xs text-muted" aria-live="polite">
            {note}
          </p>
        )}
      </fieldset>
      <div>
        <label htmlFor={`rules-${clubId}`} className="label">
          Club rules
        </label>
        <RichTextArea id={`rules-${clubId}`} name="rules" defaultValue={rules} rows={6} maxLength={3000} className="input" placeholder="What the club is for, what's welcome, what isn't." />
      </div>
      <SubmitButton className="btn-ghost">Save rules and banner</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
