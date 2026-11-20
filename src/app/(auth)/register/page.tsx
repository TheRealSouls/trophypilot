import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "../forms";
import { StepsWithDemo } from "@/components/SiteDemo";

export const metadata: Metadata = { title: "Sign up" };

const STEPS: [string, string][] = [
  ["Create an account", "Pick a username and, if you like, your country for the regional leaderboards."],
  ["Link your PSN Online ID", "We give you a short code. Put it in your PSN About Me so we know the account is yours."],
  ["Sync your trophies", "We import every game, trophy and earned date, including DLC."],
  ["Start hunting", "Follow a roadmap, watch out for missables and climb the boards."],
];

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/settings");
  return (
    <div className="mx-auto grid max-w-4xl items-start gap-10 pt-4 md:grid-cols-2">
      <div className="card p-6 sm:p-8">
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="mb-6 mt-1 text-sm text-muted">It&apos;s free. Linking PSN comes next.</p>
        <RegisterForm />
      </div>
      <StepsWithDemo steps={STEPS} />
    </div>
  );
}
