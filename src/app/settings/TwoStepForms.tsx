"use client";

import { useActionState } from "react";
import { cancelTwoStep, confirmTwoStep, disableTwoStep, newBackupCodesAction, type TwoStepState } from "@/actions/twostep";
import { SubmitButton } from "@/components/client";

function CodeInput({ id, label }: { id: string; label: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} name="code" required autoComplete="one-time-code" inputMode="numeric" maxLength={9} className="input w-40 text-center font-mono tracking-[0.2em]" />
    </div>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-good/50 bg-good/5 p-4" role="status">
      <p className="text-sm font-semibold">Save these backup codes now. They won&apos;t be shown again.</p>
      <p className="text-xs text-muted">Each works once, in place of a code from your app, if you lose your phone.</p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-4">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

/** Step two of setting up: the first code from the app. */
export function ConfirmTwoStepForm() {
  const [state, action] = useActionState<TwoStepState, FormData>(confirmTwoStep, null);
  if (state?.codes) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-good">Two-step sign-in is on.</p>
        <BackupCodes codes={state.codes} />
        <a href="/settings#two-step" className="btn-ghost">
          Done
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <CodeInput id="confirm-code" label="Code from the app" />
        <SubmitButton>Turn on</SubmitButton>
      </form>
      {state?.error && (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      )}
      <form action={cancelTwoStep}>
        <SubmitButton className="btn-ghost px-3 py-1.5 text-xs">Cancel</SubmitButton>
      </form>
    </div>
  );
}

/** When it's on: new backup codes, or turning it off (both need a current code). */
export function ManageTwoStepForms({ staff }: { staff: boolean }) {
  const [codesState, codesAction] = useActionState<TwoStepState, FormData>(newBackupCodesAction, null);
  const [offState, offAction] = useActionState<TwoStepState, FormData>(disableTwoStep, null);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">New backup codes</h3>
        {codesState?.codes ? (
          <BackupCodes codes={codesState.codes} />
        ) : (
          <form action={codesAction} className="flex flex-wrap items-end gap-3">
            <CodeInput id="codes-code" label="Code from the app" />
            <SubmitButton className="btn-ghost">Make new codes</SubmitButton>
          </form>
        )}
        {codesState?.error && (
          <p role="alert" className="text-sm text-bad">
            {codesState.error}
          </p>
        )}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Turn off</h3>
        {staff && <p className="text-xs text-muted">Staff tools need two-step sign-in, so they stop working while it&apos;s off.</p>}
        <form action={offAction} className="flex flex-wrap items-end gap-3">
          <CodeInput id="off-code" label="Code or backup code" />
          <SubmitButton className="btn-danger">Turn off</SubmitButton>
        </form>
        {offState?.error && (
          <p role="alert" className="text-sm text-bad">
            {offState.error}
          </p>
        )}
      </div>
    </div>
  );
}
