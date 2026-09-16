// Secrets live in the dashboard (`wrangler secret put`), not in wrangler.jsonc,
// so `wrangler types` cannot see them. Declaration merging adds them to the
// generated Env (rate-limit bindings come from worker-configuration.d.ts).
interface Env {
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  RESEND_SEGMENT_ID: string;
  CONTACT_TO: string;
  SUBSCRIBE_SIGNING_KEY: string;
  BROADCAST_PASSWORD: string;
  BROADCAST_POSTAL_ADDRESS: string;
}
