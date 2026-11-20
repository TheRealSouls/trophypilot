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
    html: emailHtml({
      preheader: `One click and you can post, message and start clubs on ${SITE.name}.`,
      heading: "Confirm your email address",
      paragraphs: [`Hi ${escapeHtml(user.username)},`, `Thanks for joining ${SITE.name}. Confirm your email address and you can post, message and start clubs.`],
      button: { label: "Confirm my email address", href: link },
      note: `The link works for ${LINK_DAYS} days. If you didn't make an account, you can ignore this email.`,
    }),
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

/**
 * TrophyPilot's email layout: the red banner (/email/banner.png), a white card with a heading,
 * text and one red button, and a short footer. Tables and inline styles, since that's all every
 * mail app shows the same way. If pictures are off, the banner's red background and alt text stay.
 */
export function emailHtml({
  preheader,
  heading,
  paragraphs,
  button,
  note,
}: {
  preheader: string;
  heading: string;
  paragraphs: string[];
  button: { label: string; href: string };
  note: string;
}) {
  const font = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const href = escapeHtml(button.href);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e6eb;border-radius:16px;overflow:hidden;">
<tr><td style="background:#c92e26;line-height:0;"><a href="${SITE.url}" style="text-decoration:none;"><img src="${SITE.url}/email/banner.png" width="600" alt="${SITE.name}" style="display:block;width:100%;max-width:600px;height:auto;border:0;color:#ffffff;font:700 28px ${font};line-height:150px;text-align:center;"></a></td></tr>
<tr><td style="padding:36px 40px 8px;font-family:${font};color:#12151b;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;">${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#4f5663;">${p}</p>`).join("\n")}
</td></tr>
<tr><td style="padding:12px 40px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#dc332a;">
<a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(button.label)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 40px 36px;font-family:${font};">
<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#666b74;">${escapeHtml(note)}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#666b74;">Button not working? Paste this into your browser:<br><a href="${href}" style="color:#c92e26;word-break:break-all;">${href}</a></p>
</td></tr>
</table>
<p style="margin:20px 0 0;font-family:${font};font-size:12px;line-height:1.6;color:#666b74;">${SITE.name} · <a href="${SITE.url}" style="color:#666b74;">${SITE.url.replace(/^https?:\/\//, "")}</a><br>You got this because someone made a ${SITE.name} account with this address.</p>
</td></tr>
</table>
</body></html>`;
}
