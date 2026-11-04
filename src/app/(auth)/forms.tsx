"use client";

import Link from "next/link";
import { login, register, verifySignInCode } from "@/actions/auth";
import { SubmitButton, useKeepValuesAction } from "@/components/client";
import { FormMessage } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";

export function LoginForm({ next }: { next?: string }) {
  const [state, form, pending] = useKeepValuesAction(login, null);
  return (
    <form {...form} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="identifier" className="label">Email or username</label>
        <input id="identifier" name="identifier" autoComplete="username" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pending={pending} pendingText="Signing in…">Log in</SubmitButton>
      <p className="text-center text-sm text-muted">
        New here? <Link href="/register" className="link">Create an account</Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, form, pending] = useKeepValuesAction(register, null);
  return (
    <form {...form} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="username" className="label">Username</label>
        <input id="username" name="username" autoComplete="username" required pattern="[A-Za-z0-9_]{3,20}" className="input" />
        <p className="mt-1 text-xs text-faint">Your handle on TrophyPilot. You&apos;ll link your PSN Online ID next.</p>
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <div>
        <label htmlFor="country" className="label">Country (for country leaderboards)</label>
        <select id="country" name="country" className="input" defaultValue="">
          <option value="">Prefer not to say</option>
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="terms" required className="mt-1 h-4 w-4 accent-[var(--color-accent)]" />
        <span className="text-muted">
          I&apos;m at least 13 and I agree to the{" "}
          <Link href="/terms" className="link" target="_blank">terms of service</Link> and{" "}
          <Link href="/privacy" className="link" target="_blank">privacy policy</Link>.
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pending={pending} pendingText="Creating account…">Create account</SubmitButton>
      <p className="text-center text-sm text-muted">
        Already have an account? <Link href="/login" className="link">Log in</Link>
      </p>
    </form>
  );
}

/** The second sign-in step: the code from the authenticator app (or a backup code). */
export function VerifyCodeForm() {
  const [state, form, pending] = useKeepValuesAction(verifySignInCode, null);
  return (
    <form {...form} className="space-y-4">
      <div>
        <label htmlFor="code" className="label">
          Code
        </label>
        <input
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={9}
          className="input text-center font-mono text-lg tracking-[0.3em]"
          aria-describedby="code-help"
        />
        <p id="code-help" className="mt-1 text-xs text-muted">
          The 6-digit code from your authenticator app. Lost your phone? Use one of your backup codes instead.
        </p>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pending={pending} pendingText="Checking…">
        Continue
      </SubmitButton>
    </form>
  );
}
