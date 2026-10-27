import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";
import { SITE } from "./site";
import { isDemoAccount } from "./demo";

/**
 * Email, sent through Resend (resend.com). Everything here is switched off
 * until RESEND_API_KEY is set; EMAIL_FROM is the sender, an address on a
 * domain verified in Resend.
 *
 * New members confirm their address by clicking a link before they can post,
 * message or start things. Members who joined before verification existed,
 * or while email was switched off, count as verified.
 */
export const emailEnabled = () => !!process.env.RESEND_API_KEY;

/** Accounts made before this were never asked to verify. */
const VERIFICATION_START = new Date("2026-10-26T17:00:00Z");
const LINK_DAYS = 3;

export async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || `${SITE.name} <noreply@trophypilot.com>`, to, subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend said ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

type Member = { id: string; email: string; username: string; emailVerifiedAt: Date | null; createdAt: Date; suspendedUntil?: Date | null };

export const needsVerification = (user: Member) =>
  emailEnabled() && !user.emailVerifiedAt && user.createdAt >= VERIFICATION_START && !isDemoAccount(user);

/**
 * Null when the member may post, message or start things, otherwise what to tell them: a staff suspension
 * (src/actions/staff.ts) or an unconfirmed email address. Every publishing action checks this first.
 */
export function verifyFirst(user: Member) {
  if (user.suspendedUntil && user.suspendedUntil > new Date()) {
    return `Your account is suspended until ${user.suspendedUntil.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, so you can read but not post or message.`;
  }
  return needsVerification(user)
    ? "Confirm your email address first: click the link we emailed you. You can send a new link from Settings."
    : null;
}

function secret() {
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

/** The link in the email. It carries the address, so changing the address later makes old links useless. */
export async function verificationLink(user: { id: string; email: string }) {
  const token = await new SignJWT({ purpose: "verify-email", email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${LINK_DAYS}d`)
    .sign(secret());
  return `${SITE.url}/verify-email?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(user: Member) {
  const link = await verificationLink(user);
  await sendEmail({
    to: user.email,
    subject: `Confirm your ${SITE.name} email address`,
    text: `Hi ${user.username},\n\nConfirm your email address to start posting on ${SITE.name}:\n${link}\n\nThe link works for ${LINK_DAYS} days. If you didn't make an account, ignore this email.`,
    html: `<p>Hi ${escapeHtml(user.username)},</p><p>Confirm your email address to start posting on ${SITE.name}:</p><p><a href="${link}">Confirm my email address</a></p><p>The link works for ${LINK_DAYS} days. If you didn't make an account, ignore this email.</p>`,
  });
}

/** Marks the address confirmed. False when the link is broken, expired or for an old address. */
export async function confirmEmail(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "verify-email" || !payload.sub) return false;
    const updated = await prisma.user.updateMany({
      where: { id: payload.sub, email: String(payload.email) },
      data: { emailVerifiedAt: new Date() },
    });
    return updated.count === 1;
  } catch {
    return false;
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
