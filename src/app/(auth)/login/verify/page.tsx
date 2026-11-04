import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pendingSignIn } from "@/lib/auth";
import { VerifyCodeForm } from "../../forms";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };

/** After the password, for members with two-step sign-in on. */
export default async function VerifyPage() {
  if (!(await pendingSignIn())) redirect("/login");
  return (
    <div className="mx-auto max-w-md pt-4">
      <div className="card p-6 sm:p-8">
        <h1 className="text-xl font-bold">Two-step sign-in</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Open your authenticator app and enter the code for TrophyPilot.</p>
        <VerifyCodeForm />
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/login" className="link">
          Start again
        </Link>
      </p>
    </div>
  );
}
