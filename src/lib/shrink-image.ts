/**
 * Makes a picture small enough to upload: at most 1600px on its longest side,
 * as WebP (JPEG where the browser can't make WebP), stepping the quality down
 * until it's under about 400 KB. GIFs are sent as they are so they keep moving.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") {
    if (file.size > 1_000_000) throw new Error("GIFs can be up to 1 MB. Try a shorter or smaller one.");
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn't a picture we can read. Try a JPEG, PNG or WebP.");
  }
  let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const quality = attempt < 3 ? 0.82 - attempt * 0.1 : 0.6;
    const encode = (type: string) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, quality));
    let blob = await encode("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
    if (blob && blob.size <= 400_000) return blob;
    if (attempt >= 2) scale *= 0.8;
  }
  throw new Error("That picture is too detailed to shrink enough. Try a smaller one.");
}

/** Shrinks and uploads a picture (/api/uploads); returns its address, or throws with a message to show. */
export async function uploadPicture(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", await shrinkImage(file));
  const res = await fetch("/api/uploads", { method: "POST", body });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "The upload didn't work. Try again in a moment.");
  return data.url;
}
