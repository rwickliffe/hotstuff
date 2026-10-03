// JSON in and JSON out: read a request body within a size cap, or build a
// reply.
//
// Nothing here knows this site's error vocabulary. readJson reports what went
// wrong and the caller decides what that means on the wire, the same way
// worker/mail.ts reports a MailFailure rather than a status code.

/** A decoded JSON body. Off the wire, so every field is still unproven. */
export type JsonBody = Record<string, unknown>;

/** Why a body was refused: over the cap, or not a JSON object. */
export type JsonBodyFailure = "size" | "bad";

export type JsonBodyResult =
  { ok: true; data: JsonBody } | { ok: false; reason: JsonBodyFailure };

/**
 * A JSON reply. Thin on purpose: `Response.json` is the platform's, and this
 * only exists so ~20 call sites can say `json(obj, 400)` instead of repeating
 * `{ status: 400 }`. No charset parameter — JSON is UTF-8 by definition
 * (RFC 8259) and the runtime leaves it off.
 */
export function json(obj: unknown, status: number): Response {
  return Response.json(obj, { status });
}

/**
 * Parse a JSON body, refusing anything over `maxBytes`. The header is checked
 * first so an oversized body can be rejected before it is read, and the text
 * is checked again because a request may arrive without Content-Length.
 */
export async function readJson(
  req: Request,
  maxBytes: number,
): Promise<JsonBodyResult> {
  const len = Number(req.headers.get("Content-Length") || "0");
  // Returning here leaves the body unread, on purpose: an oversized request
  // should cost us nothing to refuse. Cloudflare discards it and the next
  // request on the same connection is fine (checked against the deployed
  // Worker). `wrangler dev` does not: locally, the request after an oversized
  // one fails with "Network connection lost". That is the proxy, not this.
  if (len > maxBytes) return { ok: false, reason: "size" };
  const text = await req.text();
  if (text.length > maxBytes) return { ok: false, reason: "size" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "bad" };
  }
  // `null`, an array or a bare number parse fine but are not a body: callers
  // read named fields off this, and `null.name` throws.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "bad" };
  }
  return { ok: true, data: parsed as JsonBody };
}
