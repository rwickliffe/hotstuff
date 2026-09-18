// Pure helpers shared by the Worker entry and unit tests.
// Kept out of worker.ts so the entry module only exports `default` —
// with Static Assets, workerd treats every named export as an entrypoint
// candidate and rejects constants like CONFIRM_TTL_MS.

export const MAX_BODY_BYTES = 8192;
export const MAX_SEND_BODY_BYTES = 65536;
export const CONFIRM_TTL_MS = 60 * 60 * 1000;

const MAX_EMAIL = 254;

export function emailOk(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const e = s.trim().toLowerCase();
  if (e.length < 5 || e.length > MAX_EMAIL) return false;
  if (e.includes("..")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(e))
    return false;
  return e
    .slice(e.lastIndexOf("@") + 1)
    .split(".")
    .every((label) => !label.startsWith("-") && !label.endsWith("-"));
}

export function esc(s: unknown): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Compare secrets without leaking length. Hash both sides first so unequal
 *  lengths still take the same path; digests are always 32 bytes. Prefer
 *  SubtleCrypto.timingSafeEqual (Workers); fall back to a XOR fold for Node
 *  tests, which do not expose that method on `crypto.subtle`. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [aa, bb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const aBytes = new Uint8Array(aa);
  const bBytes = new Uint8Array(bb);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(aBytes, bBytes);
  }
  let out = 0;
  for (let i = 0; i < aBytes.length; i++) out |= aBytes[i]! ^ bBytes[i]!;
  return out === 0;
}

function b64url(bytes: Uint8Array | ArrayBuffer): string {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function makeToken(
  email: string,
  exp: number,
  secret: string,
): Promise<string> {
  const payload = email + "|" + exp;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return b64url(new TextEncoder().encode(payload)) + "." + b64url(sig);
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<string | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  // Exactly two, so a token carrying extra dots is refused rather than having
  // the tail quietly ignored. The pair is pulled out after that check so the
  // reads below are provably present rather than asserted to be.
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  let payload, ok;
  try {
    payload = new TextDecoder().decode(fromB64url(body));
    const key = await hmacKey(secret);
    ok = await crypto.subtle.verify(
      "HMAC",
      key,
      fromB64url(sig),
      new TextEncoder().encode(payload),
    );
  } catch {
    return null;
  }
  if (!ok) return null;
  const bar = payload.lastIndexOf("|");
  if (bar < 1) return null;
  const email = payload.slice(0, bar);
  const exp = Number(payload.slice(bar + 1));
  if (!emailOk(email) || !Number.isFinite(exp) || Date.now() > exp) return null;
  return email;
}
