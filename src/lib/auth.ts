import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";

const COOKIE = "trophypilot_session";
/**
 * Readable by the page (not secret): changes whenever someone signs in or
 * out, so the navbar knows to fetch /api/me again. The pages themselves don't
 * read the session, which lets them be cached.
 */
export const SIGNED_IN_COOKIE = "tp_signed_in";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  (await cookies()).set(SIGNED_IN_COOKIE, Date.now().toString(36), {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/**
 * Two-step sign-in: after the right password, members with an authenticator
 * get this short-lived cookie instead of a session, and the session starts
 * once /login/verify accepts their code.
 */
const PENDING = "trophypilot_2fa";
const PENDING_SECONDS = 10 * 60;

export async function startPendingSignIn(userId: string, next: string | null) {
  const token = await new SignJWT({ purpose: "2fa", next: next ?? "" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(PENDING, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: PENDING_SECONDS });
}

/** Who is half-way through signing in, and where they were going. */
export async function pendingSignIn(): Promise<{ userId: string; next: string | null } | null> {
  const token = (await cookies()).get(PENDING)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "2fa" || !payload.sub) return null;
    return { userId: payload.sub, next: typeof payload.next === "string" && payload.next ? payload.next : null };
  } catch {
    return null;
  }
}

export async function endPendingSignIn() {
  (await cookies()).delete(PENDING);
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(SIGNED_IN_COOKIE);
}

export const getSessionUserId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub ?? null;
  } catch {
    return null;
  }
});

export const getCurrentUser = cache(async () => {
  const id = await getSessionUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, include: { psn: true } });
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}
