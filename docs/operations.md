# Operations

## Hosting

The site and the mail API are one Cloudflare Worker (`hotstuff`). Astro builds
into `dist/`; Wrangler serves `dist/client` as Static Assets (CSS, images,
`_headers`) and runs `src/worker/index.ts` for HTML, mail, `/data`, and cron.

GitHub stays the repo and runs `./check` in Actions. GitHub Pages is not used.
`tools/`, `src/`, `data/`, and these docs are not served as source — only the
build output and the Worker.

The Worker runs on their Cloudflare account, pinned by `account_id` so a login
with access to more than one cannot ship to the wrong place.
`paulaandcrazyjohn.com` is attached to it as a Custom Domain.

Keep the repo public: Actions stay free and whoever comes next can fork it.

Nothing in the live data path depends on the developer's account, and it needs
to stay that way. The Worker cron pulls the sheet into *their* Cloudflare KV;
a stalled job in somebody else's account would freeze their prices with no
error they can see.

## Metrics

Web Analytics covers traffic. **Workers Analytics Engine** answers product
questions the ask button was for: which jars people request, plus successful
contact and subscribe mail counts. The Worker writes to the account-scoped
dataset `hotstuff-metrics` (binding `METRICS`) after Resend accepts the send —
product name only for asks; never email or IP.

Query with an API token that has Account Analytics Read
([SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)):

```sql
SELECT blob1 AS event, blob2 AS detail, SUM(_sample_interval) AS n
FROM "hotstuff-metrics"
WHERE timestamp > NOW() - INTERVAL '30' DAY
GROUP BY event, detail
ORDER BY n DESC
```

`event` is `ask`, `contact`, or `subscribe`; for asks, `detail` is the jar name.
Use `SUM(_sample_interval)`, not `COUNT(*)`, so sampling stays correct.

## Mail

Contact form and confirmed newsletter signup run through the same Worker that
serves the site, plus Resend. The page POSTs JSON as `text/plain` to relative
paths (`/contact`, `/subscribe`). `MAIL_ENABLED = false` in `public/site.js` leaves the
forms on the page but idle — they do not POST. `LIST_ENABLED` stays `false`
until the Segment is theirs.

- **Contact** is transactional: Resend emails Paula, Reply-To is the
  visitor. Nothing is stored. Safe to point at your Worker while
  developing.
- **Newsletter** is double opt-in. `/subscribe` only sends a confirm
  mail; `GET /confirm` shows a button; `POST /confirm` adds them to the
  Segment. Contacts are global in Resend; a Segment is a named group of them,
  found under Audience in the dashboard, and a Broadcast targets one Segment.
  Keep `LIST_ENABLED = false` on the public site until that Segment is *theirs*.
  A CSV export is not a consent record.
- **Broadcasts** wait on `BROADCAST_POSTAL_ADDRESS` (a PO box they will print).
  `/send` refuses without it. Compose lives at the Worker `/compose` URL,
  not in the nav. Generate `BROADCAST_PASSWORD` with `openssl rand -base64 24`.

Resend free tier: 3,000 transactional mails a month **and** 100/day, plus
1,000 marketing contacts. Confirm in the dashboard whether broadcasts
share the daily cap before the first real send. Do not loop the
transactional Send API over the list.

Open `?debug` to see whether mail is `same-origin` or `off`, and after a failed
mail attempt whether the note says `Resend daily cap` or `could not reach`.

Account ownership and handoff steps are kept in private notes, outside this
repo.

The Worker covers the contact form and the list, and it can receive Square's
webhooks later, so there is no separate form or newsletter vendor. Names and
emails from the forms go to Resend, not GitHub.

## Their inbox

Resend sending from `@their-domain` (SPF, DKIM) is not a mailbox.
Customers still cannot write to it.

For humans: Cloudflare Email Routing, free, into the Gmail they already
use. `orders@` or a catch-all. They reply from Gmail. A `gmail.com` From
is fine until they ask otherwise. Google Workspace is nicer mail, not
cheaper mail (~$7/user/month). Do not use Resend as their inbox.

## Planned: Square as the catalog

They have asked for a catalog that matches Square on a busy market day. A
sheet refreshed on a cron cannot do that alone, so this stays on the Worker.

Crazy John adds two or three jars a week and they already keep inventory
in Square. The products tab would be a second copy. Square becomes the
source of truth. The events tab stays: Square is not a calendar.

Catalog refresh already lives on the Worker (sheet → KV), so if Square becomes
the source, that fetch belongs there too.

Need from them, once: fifteen minutes with whoever signs into Square, to
create a Developer app on *their* seller account and put the production
token on the Worker (`npx wrangler secret put`). Two fields on each item they already create:
Maker (`Paula` or `John`; a category each is fine) and Heat (`1` to `6`).
Name, description, price, and pint vs quart already live in Square. Stamp
heat and maker on the current list from the sheet so they are not
retyping. Ask once how they mark sold out (quantity hits zero, they hide
it, or they archive it) and whether quarts are a second variation or a
separate item.

A daily CSV is fine for names, heat, and prices. It is not fine for stock
during a market. Square can push `inventory.count.updated`; the Worker can
receive it. Do not commit on every sale — a busy booth would spam rebuilds.

The Worker receives the webhook and updates KV. Pages already render from
KV. If the Worker is down, keep the last snapshot. An open tab from the
morning is still stale until they reload. Square checkout is the only
place that cannot lie. Shop links stay on Square. This site still does
not take money.

## Cost

Cloudflare Workers and Resend's free tiers cover a salsa shop (Resend:
3,000 transactional mails a month and 100/day, 1,000 newsletter contacts;
confirm whether broadcasts share the daily cap). Square Marketing is a
paid add-on; skip it unless they already want to pay Square for email.
