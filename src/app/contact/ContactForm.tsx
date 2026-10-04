"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useForm, ValidationError } from "@formspree/react";
import clsx from "clsx";
import { Recaptcha, type RecaptchaHandle } from "@/components/Recaptcha";
import { claimContactSlot, releaseContactSlot } from "@/actions/contact";
import { TOPICS, type Topic } from "./topics";

/** Topics where knowing the PSN account saves a round trip. */
const NEEDS_PSN: Topic[] = ["psn", "removal"];

export function ContactForm({
  formId,
  topic: initialTopic,
  email,
  username,
  onlineId,
  captchaSiteKey,
}: {
  formId: string;
  topic: Topic;
  email?: string;
  username?: string;
  onlineId?: string;
  /** Google reCAPTCHA v2 site key. Without one the form sends without a captcha. */
  captchaSiteKey?: string;
}) {
  // The token is read when the form is sent; Formspree checks it with the secret key.
  const token = useRef<string | null>(null);
  const captcha = useRef<RecaptchaHandle>(null);
  const [captchaProblem, setCaptchaProblem] = useState<string | null>(null);
  const [state, submit, reset] = useForm(formId, {
    data: captchaSiteKey ? { "g-recaptcha-response": () => token.current ?? "" } : undefined,
  });

  // One message a day: the server claims today's slot before the message goes to Formspree.
  const [limitProblem, setLimitProblem] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const claimed = useRef<string[]>([]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (captchaSiteKey && !token.current) {
      setCaptchaProblem("Tick \"I'm not a robot\" before sending.");
      return;
    }
    const data = new FormData(e.currentTarget);
    setLimitProblem(null);
    setClaiming(true);
    try {
      const slot = await claimContactSlot();
      if (!slot.ok) {
        setLimitProblem(slot.error);
        return;
      }
      claimed.current = slot.ids;
    } catch {
      setLimitProblem("We couldn't send that just now. Check your connection and try again.");
      return;
    } finally {
      setClaiming(false);
    }
    await submit(data);
  };

  // A token works once: after a failed send, ask for a fresh tick and give the day's slot back.
  useEffect(() => {
    if (!state.errors) return;
    captcha.current?.reset();
    if (claimed.current.length) {
      void releaseContactSlot(claimed.current);
      claimed.current = [];
    }
  }, [state.errors]);
  const sending = claiming || state.submitting;
  const [topic, setTopic] = useState<Topic>(initialTopic);
  const needsPsn = NEEDS_PSN.includes(topic);

  if (state.succeeded) {
    return (
      <div role="status" className="border border-good/50 p-5">
        <p className="font-semibold text-good">Message sent.</p>
        <p className="mt-1 text-sm text-muted">
          Thanks for getting in touch. We reply by email, usually within a few days.
          {topic === "removal" && " Removal requests are handled within 30 days, and we'll confirm when it's done."}
        </p>
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={reset} className="btn-ghost">
            Send another
          </button>
          <Link href="/" className="btn-ghost">
            Home
          </Link>
        </div>
      </div>
    );
  }

  const formErrors = state.errors?.getFormErrors() ?? [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
      {/* Subject line in the Formspree email, so messages are easy to sort. */}
      <input type="hidden" name="_subject" value={`TrophyPilot contact: ${TOPICS[topic]}`} />
      {username && <input type="hidden" name="account" value={username} />}
      {/* Honeypot: people never see or fill this, bots usually do. Formspree drops those submissions. */}
      <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <div>
        <label htmlFor="topic" className="label">
          What is it about?
        </label>
        <select id="topic" name="topic" value={topic} onChange={(e) => setTopic(e.target.value as Topic)} className="input">
          {Object.entries(TOPICS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">
            Name <span className="normal-case tracking-normal text-faint">(optional)</span>
          </label>
          <input id="name" name="name" autoComplete="name" maxLength={100} className="input" />
        </div>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={email} className="input" />
          <ValidationError field="email" prefix="Email" errors={state.errors} className="mt-1 block text-xs text-bad" />
        </div>
      </div>

      <div className={clsx(!needsPsn && "hidden")}>
        <label htmlFor="onlineId" className="label">
          PSN Online ID
        </label>
        <input
          id="onlineId"
          name="psnOnlineId"
          required={needsPsn}
          disabled={!needsPsn}
          defaultValue={onlineId}
          autoComplete="off"
          spellCheck={false}
          maxLength={16}
          pattern="[A-Za-z][A-Za-z0-9_\-]{2,15}"
          className="input"
        />
        {topic === "removal" && (
          <p className="mt-1 text-xs text-muted">
            We&apos;ll hide this profile from lookups, search and leaderboards. We may ask you to confirm you own it, for example
            by adding a code to your PSN About Me.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="message" className="label">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={7}
          minLength={10}
          maxLength={5000}
          className="input"
          placeholder={
            topic === "bug"
              ? "What were you doing, what did you expect, and what happened instead? The page address helps."
              : topic === "content"
                ? "Link to the guide, tip or profile, and what's wrong with it."
                : undefined
          }
        />
        <ValidationError field="message" prefix="Message" errors={state.errors} className="mt-1 block text-xs text-bad" />
      </div>

      {limitProblem && (
        <p role="alert" className="border border-bad/50 px-3 py-2 text-sm text-bad">
          {limitProblem}
        </p>
      )}

      {formErrors.length > 0 && (
        <p role="alert" className="border border-bad/50 px-3 py-2 text-sm text-bad">
          {formErrors.map((e) => e.message).join(" ")}
        </p>
      )}

      {captchaSiteKey && (
        <div>
          <Recaptcha
            ref={captcha}
            siteKey={captchaSiteKey}
            onChange={(t) => {
              token.current = t;
              if (t) setCaptchaProblem(null);
            }}
            onError={setCaptchaProblem}
          />
          {captchaProblem && (
            <p role="alert" className="mt-2 text-sm text-bad">
              {captchaProblem}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            This form is protected by reCAPTCHA, and Google&apos;s{" "}
            <a href="https://policies.google.com/privacy" className="link" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="https://policies.google.com/terms" className="link" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>{" "}
            apply.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={sending} aria-busy={sending} className="btn-primary">
          {sending ? "Sending…" : "Send message"}
        </button>
        <p className="text-xs text-muted">
          One message a day. Sent through Formspree. See the{" "}
          <Link href="/privacy" className="link">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
