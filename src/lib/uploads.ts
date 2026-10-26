import { randomBytes } from "node:crypto";
import { prisma } from "./db";

/**
 * Pictures members upload for posts, messages and guides, kept in a public
 * Supabase Storage bucket. Needs SUPABASE_URL (https://<project>.supabase.co)
 * and SUPABASE_SECRET_KEY (a secret or service_role key, server only); without
 * them the upload button doesn't show.
 *
 * The browser shrinks pictures before sending them (RichTextArea), so each is
 * usually 100 to 300 KB. Supabase's free plan has 1 GB of storage.
 */
const BUCKET = "uploads";
export const UPLOADS_PER_DAY = 20;
export const MAX_BYTES = 450_000;
/** GIFs aren't re-encoded (that would stop the animation), so they may be bigger. */
export const MAX_GIF_BYTES = 1_000_000;
/** Stop taking uploads before the free 1 GB is full. */
const TOTAL_LIMIT = 900 * 1024 * 1024;

export const uploadsEnabled = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

const base = () => process.env.SUPABASE_URL!.replace(/\/+$/, "");
function headers(extra: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SECRET_KEY!;
  // New-style secret keys (sb_secret_...) go in apikey only; older service_role keys are JWTs and go in both.
  return { apikey: key, ...(key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` }), ...extra };
}

/** What the file really is, from its first bytes (never trusting the name or the browser's type). */
export function sniffImage(bytes: Uint8Array): { type: string; ext: string } | null {
  const at = (i: number, ...v: number[]) => v.every((b, j) => bytes[i + j] === b);
  if (at(0, 0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: "image/png", ext: "png" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { type: "image/webp", ext: "webp" };
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return { type: "image/gif", ext: "gif" };
  return null;
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const res = await fetch(`${base()}/storage/v1/bucket`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: MAX_GIF_BYTES,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  // 409 (or 400 "already exists" on some versions) means it's there already.
  if (!res.ok && res.status !== 409 && !/already exists/i.test(await res.text())) throw new Error(`Couldn't create the uploads bucket (${res.status}).`);
  bucketReady = true;
}

/** Why this member can't upload right now, or null. */
export async function uploadBlocked(userId: string) {
  const [today, total] = await Promise.all([
    prisma.upload.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } }),
    prisma.upload.aggregate({ _sum: { bytes: true } }),
  ]);
  if (today >= UPLOADS_PER_DAY) return `You can upload ${UPLOADS_PER_DAY} pictures a day. Try again tomorrow, or link to a picture instead.`;
  if ((total._sum.bytes ?? 0) >= TOTAL_LIMIT) return "Picture uploads are full for now. Link to a picture instead.";
  return null;
}

/** Stores the picture and returns its public address. */
export async function storeUpload(userId: string, bytes: Uint8Array, kind: { type: string; ext: string }) {
  await ensureBucket();
  const path = `${userId}/${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${kind.ext}`;
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers({ "Content-Type": kind.type, "Cache-Control": "max-age=31536000", "x-upsert": "false" }),
    body: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: kind.type }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Storage said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  await prisma.upload.create({ data: { userId, path, bytes: bytes.length } });
  return `${base()}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Deletes everything a member uploaded (when they delete their account). */
export async function deleteUploadsOf(userId: string) {
  if (!uploadsEnabled()) return;
  const rows = await prisma.upload.findMany({ where: { userId }, select: { path: true } });
  for (let i = 0; i < rows.length; i += 100) {
    await fetch(`${base()}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: rows.slice(i, i + 100).map((r) => r.path) }),
      signal: AbortSignal.timeout(20_000),
    });
  }
}
