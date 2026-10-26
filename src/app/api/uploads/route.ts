import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { verifyFirst } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_BYTES, MAX_GIF_BYTES, sniffImage, storeUpload, uploadBlocked, uploadsEnabled } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** A picture from the formatting toolbar. Answers { url } to put in the text, or { error }. */
export async function POST(req: Request) {
  if (!uploadsEnabled()) return fail("Picture uploads aren't switched on.", 404);
  const user = await getCurrentUser();
  if (!user) return fail("Log in to upload pictures.", 401);
  const unverified = verifyFirst(user);
  if (unverified) return fail(unverified, 403);
  if (!(await rateLimit("upload", 5, 60_000, user.id))) return fail("Slow down a little and try again in a minute.", 429);
  const blocked = await uploadBlocked(user.id);
  if (blocked) return fail(blocked, 429);

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof Blob)) return fail("Pick a picture to upload.");
  if (file.size > MAX_GIF_BYTES) return fail("That picture is too big. Try a smaller one.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return fail("That isn't a picture we can use. Upload a JPEG, PNG, WebP or GIF.");
  if (kind.type !== "image/gif" && bytes.length > MAX_BYTES) return fail("That picture is too big. Try a smaller one.");

  try {
    return NextResponse.json({ url: await storeUpload(user.id, bytes, kind) });
  } catch (err) {
    console.error("[uploads] failed", err);
    return fail("The upload didn't work. Try again in a moment.", 502);
  }
}
