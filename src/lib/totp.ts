import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Two-step sign-in with an authenticator app (RFC 6238 TOTP: 6 digits, 30
 * seconds, SHA-1, which every app supports). Plus one-time backup codes for a
 * lost phone, stored only as hashes.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string) {
  const clean = s.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

function codeAt(secret: string, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const n = ((h[offset] & 127) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** True if the code matches now, or 30 seconds either side (phone clocks drift). */
export function verifyTotp(secret: string, code: string, now = Date.now()) {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return false;
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((d) => {
    const want = Buffer.from(codeAt(secret, step + d));
    return timingSafeEqual(want, Buffer.from(c));
  });
}

/** The link authenticator apps read from the QR code. */
export const otpauthUri = (account: string, secret: string) =>
  `otpauth://totp/${encodeURIComponent(`TrophyPilot:${account}`)}?secret=${secret}&issuer=TrophyPilot&algorithm=SHA1&digits=6&period=30`;

/** Shown as "ABCD EFGH IJKL…" for typing into an app by hand. */
export const groupedSecret = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

const hash = (code: string) => createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");

/** Eight one-time codes like "K7QD-3MXA", and their hashes to store. */
export function newBackupCodes() {
  const codes = Array.from({ length: 8 }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: JSON.stringify(codes.map(hash)) };
}

/** If the code is one of the unused backup codes: the stored list without it. Otherwise null. */
export function redeemBackupCode(stored: string, code: string): string | null {
  let list: string[];
  try {
    list = JSON.parse(stored) as string[];
  } catch {
    return null;
  }
  const h = hash(code);
  if (!list.includes(h)) return null;
  return JSON.stringify(list.filter((x) => x !== h));
}
