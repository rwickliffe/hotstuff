// Comparisons that must not leak information through timing.
//
// Lives under worker/ rather than lib/ because it reaches for
// crypto.subtle.timingSafeEqual, a Cloudflare extension that only exists in
// the Worker's type environment. The Node fallback is for the unit tests.

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
