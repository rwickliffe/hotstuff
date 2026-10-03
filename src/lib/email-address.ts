/**
 * Address validation. Deliberately narrower than the RFCs, because the job is
 * "safe to put in a mail payload and a reply_to header", not "legal address".
 *
 * Checked against the obvious libraries rather than assumed: validator.isEmail
 * accepts `"a b"@c.co`, `"x\"y"@c.co` and `üser@example.com`, all RFC-legal
 * and all things we refuse; zod accepts `a@b-.co`, a trailing-hyphen label.
 * Configuring either to match would be the same policy, stated through
 * someone else's options. The rejected cases in the tests are the spec.
 *
 * The real check is the provider's: this only turns away typos early and
 * refuses anything that could smuggle a header.
 */
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
