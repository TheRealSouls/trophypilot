import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Checks a scheduler's call to /api/cron/*. The secret is CRON_SECRET (Render,
 * Environment). It's accepted as `Authorization: Bearer <secret>`, and also
 * without "Bearer", with any capitals, spaces or quotes around it, or in an
 * `X-Cron-Secret` header, since schedulers' header forms make those slips easy.
 * Returns null when the call may go ahead, or the 401 to send back, which says
 * what's wrong (never the secret itself).
 */
export function cronRefusal(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return refuse("CRON_SECRET isn't set on the server. Add it in Render, Environment.");
  const raw = req.headers.get("authorization") ?? req.headers.get("x-cron-secret");
  if (!raw) return refuse("No Authorization header. Add the header Authorization with the value: Bearer <CRON_SECRET>.");
  const given = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^bearer\s*:?\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return refuse("The secret doesn't match CRON_SECRET. Copy it again from Render, Environment, with nothing before or after it.");
  }
  return null;
}

function refuse(error: string) {
  return NextResponse.json({ error: `Unauthorized: ${error}` }, { status: 401 });
}
