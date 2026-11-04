"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession, endPendingSignIn, pendingSignIn, startPendingSignIn } from "@/lib/auth";
import { redeemBackupCode, verifyTotp } from "@/lib/totp";
import { COUNTRIES } from "@/lib/countries";
import { rateLimit } from "@/lib/rate-limit";
import { emailEnabled, sendVerificationEmail } from "@/lib/email";
import { hasHateSpeech } from "@/lib/moderation";
import { hashString } from "@/lib/utils";

export type FormState = { error?: string; ok?: string } | null;

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "Usernames are 3 to 20 characters: letters, numbers or underscores."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  country: z
    .string()
    .optional()
    .transform((c) => (c && c in COUNTRIES ? c : null)),
});

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : null;
}

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  if (!(await rateLimit("register", 5, 60 * 60_000))) return { error: "Too many sign-ups from your network. Try again later." };
  if (fd.get("terms") !== "on") return { error: "You need to accept the terms of service and privacy policy." };
  const parsed = registerSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, username, password, country } = parsed.data;
  if (hasHateSpeech(username)) return { error: "That username isn't allowed. Pick a different one." };

  const clash = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { email: true } });
  if (clash) return { error: clash.email === email ? "An account with that email already exists." : "That username is taken." };

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash: await bcrypt.hash(password, 12),
      country,
      avatarHue: hashString(username) % 360,
      // Without email sending there's no way to verify, so the account counts as verified.
      emailVerifiedAt: emailEnabled() ? null : new Date(),
    },
  });
  if (emailEnabled()) await sendVerificationEmail(user).catch((err) => console.error("[email] verification email failed", err));
  await createSession(user.id);
  redirect("/settings?welcome=1#psn");
}

let dummyHash: string | undefined;

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("identifier") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!id || !password) return { error: "Enter your email/username and password." };
  if (!(await rateLimit("login", 10, 15 * 60_000))) return { error: "Too many login attempts. Wait a few minutes and try again." };

  const user = await prisma.user.findFirst({ where: { OR: [{ email: id }, { username: id }] } });
  // Compare against a dummy hash when the user doesn't exist to keep timing uniform.
  dummyHash ??= await bcrypt.hash("trophypilot-timing-dummy", 12);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!user || !ok) return { error: "Incorrect email/username or password." };

  // Two-step sign-in: the password was right, now the code from their authenticator app.
  if (user.totpEnabledAt && user.totpSecret) {
    await startPendingSignIn(user.id, safeNext(fd.get("next")));
    redirect("/login/verify");
  }
  await createSession(user.id);
  redirect(safeNext(fd.get("next")) ?? `/u/${user.username}`);
}

/** The second step: a 6-digit code from the authenticator app, or one of the backup codes. */
export async function verifySignInCode(_: FormState, fd: FormData): Promise<FormState> {
  const pending = await pendingSignIn();
  if (!pending) return { error: "That took too long. Log in again." };
  if (!(await rateLimit("2fa", 8, 15 * 60_000, pending.userId))) return { error: "Too many tries. Wait a few minutes and log in again." };
  const user = await prisma.user.findUnique({ where: { id: pending.userId }, select: { id: true, username: true, totpSecret: true, totpBackupCodes: true } });
  if (!user?.totpSecret) return { error: "That took too long. Log in again." };
  const code = String(fd.get("code") ?? "").trim();
  if (!verifyTotp(user.totpSecret, code)) {
    const left = redeemBackupCode(user.totpBackupCodes, code);
    if (left === null) return { error: "That code isn't right. Use the 6-digit code your authenticator app shows now, or a backup code." };
    await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodes: left } });
  }
  await endPendingSignIn();
  await createSession(user.id);
  redirect(pending.next ?? `/u/${user.username}`);
}

export async function logout() {
  await destroySession();
  redirect("/");
}
