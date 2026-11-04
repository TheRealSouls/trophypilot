"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { newBackupCodes, newTotpSecret, redeemBackupCode, verifyTotp } from "@/lib/totp";

/**
 * Turning two-step sign-in on and off (Settings). Setting up stores a new
 * secret but doesn't switch anything on until a code from the app proves
 * it's been added; then the backup codes are shown, once.
 */

/** Starts (or restarts) setting up: a fresh secret to add to the app. */
export async function beginTwoStep() {
  const user = await requireUser("/settings");
  if (user.totpEnabledAt) return;
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: newTotpSecret() } });
  revalidatePath("/settings");
}

export async function cancelTwoStep() {
  const user = await requireUser("/settings");
  if (user.totpEnabledAt) return;
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: null } });
  revalidatePath("/settings");
}

export type TwoStepState = { error?: string; codes?: string[] } | null;

/** The first code from the app: switches two-step on and hands back the backup codes. */
export async function confirmTwoStep(_: TwoStepState, fd: FormData): Promise<TwoStepState> {
  const user = await requireUser("/settings");
  if (!(await rateLimit("2fa-setup", 10, 15 * 60_000, user.id))) return { error: "Too many tries. Wait a few minutes." };
  if (user.totpEnabledAt) return { error: "Two-step sign-in is already on." };
  if (!user.totpSecret) return { error: "Start setting it up first." };
  if (!verifyTotp(user.totpSecret, String(fd.get("code") ?? ""))) return { error: "That code isn't right. Check the app shows TrophyPilot and try the newest code." };
  const { codes, hashes } = newBackupCodes();
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), totpBackupCodes: hashes } });
  return { codes };
}

/** Turning it off needs a current code (or a backup code), so a borrowed session can't do it. */
export async function disableTwoStep(_: TwoStepState, fd: FormData): Promise<TwoStepState> {
  const user = await requireUser("/settings");
  if (!(await rateLimit("2fa-setup", 10, 15 * 60_000, user.id))) return { error: "Too many tries. Wait a few minutes." };
  if (!user.totpEnabledAt || !user.totpSecret) return { error: "Two-step sign-in is already off." };
  const code = String(fd.get("code") ?? "");
  if (!verifyTotp(user.totpSecret, code) && redeemBackupCode(user.totpBackupCodes, code) === null) return { error: "That code isn't right." };
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: null, totpSecret: null, totpBackupCodes: "[]" } });
  revalidatePath("/settings");
  return null;
}

/** New backup codes (the old ones stop working), with a current code. */
export async function newBackupCodesAction(_: TwoStepState, fd: FormData): Promise<TwoStepState> {
  const user = await requireUser("/settings");
  if (!(await rateLimit("2fa-setup", 10, 15 * 60_000, user.id))) return { error: "Too many tries. Wait a few minutes." };
  if (!user.totpEnabledAt || !user.totpSecret) return { error: "Turn two-step sign-in on first." };
  if (!verifyTotp(user.totpSecret, String(fd.get("code") ?? ""))) return { error: "That code isn't right." };
  const { codes, hashes } = newBackupCodes();
  await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodes: hashes } });
  return { codes };
}
