# Paula and Crazy John's Hot Stuff

[![check](https://github.com/rwickliffe/hotstuff/actions/workflows/check.yml/badge.svg)](https://github.com/rwickliffe/hotstuff/actions/workflows/check.yml)

Website for a small-batch salsa, hot sauce, cowboy candy, pickle and chow chow
maker in Elgin, Texas, who sell at farmers markets and community events.

An Astro site on one Cloudflare Worker: `/` and `/products` render from KV on
each request, plus a stylesheet, images, and `public/site.js` for the heat
filter, theme, and forms. Paula edits a Google Sheet; a Worker cron stores it
in KV. Catalog freshness does not wait on a deploy.

`/` leads with a handful of featured jars per maker. `/products` carries the
full list, which runs to sixty-odd items and turns over with the season. Cards
are one Astro component; `site.js` does not draw them.

## Why it is built this way

Paula and Crazy John need to keep the site current themselves. Everything that
changes often is therefore handled outside the code, in apps they already use
daily:

| What | Changes | Who updates it | Where |
|---|---|---|---|
| Product list, prices, sold out | Often | Them | A Google Sheet |
| Market and event schedule | Weekly | Them | The same Google Sheet, second tab |
| News and announcements | Weekly | Them | Facebook |
| Photos, story, layout | Rarely | A developer | This repo |

Ordering and payment happen on Square, so this site never takes money.
Contact notes and newsletter signups go to Resend through the same Worker
that serves the site (`MAIL_ENABLED` in `public/site.js`) — not into this repo.

### What a similar project keeps

`src/lib/` is generic: a similar project keeps it. `src/domain/` is this
business's own: they replace it. Pages and the Worker call the domain names;
the modules underneath take field names, predicates, and caps as arguments.

## Connecting the Google Sheet

One spreadsheet with two tabs still drives the catalog and schedule. Paula
edits the sheet; the Worker fetches the published CSVs on a cron (and when
`/data` is cold or stale) and stores them in KV. Pages render from KV. If KV
is empty, they fall back to `data/catalog-snapshot.json`. The browser never
talks to Google.

The CSV publish URLs live in `wrangler.jsonc` under `vars`
(`PRODUCTS_CSV_URL`, `EVENTS_CSV_URL`). Each must end in **`output=csv`**.

```js
// wrangler.jsonc → vars (not secrets)
PRODUCTS_CSV_URL  // products tab
EVENTS_CSV_URL    // events tab
```

`MAIL_ENABLED` / `LIST_ENABLED` stay in `public/site.js`:

```js
const MAIL_ENABLED = true;  // false = forms idle, no POST
const LIST_ENABLED = false; // true only on their Resend Segment
```

The sheet already exists. There is no CSV in this repo to import.
Publish each tab with File, Share, Publish to web, picking that tab by name
and CSV as the format, with "Automatically republish when changes are made"
left ticked. Two tabs means two addresses. Each must end in **`output=csv`**, like this:

```
https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=685501268&single=true&output=csv
```

Two lookalikes that do not work, both returning HTML rather than CSV:

- `.../pubhtml?gid=...` is the Web page format. Pick Comma-separated values instead.
- `.../edit#gid=...` is the editor address from the browser bar. It needs a login.

Neither errors. The Worker fetches them successfully, finds no rows it
recognises, and keeps whatever was already in KV (or the committed snapshot),
so the site looks stale rather than broken. `?debug` is how you see that.

Google edge-caches published CSVs, so an edit can take a few minutes to reach
the site. That is usually the explanation when a change does not show up.

**Catalog.** The `products` tab. The Worker stores it in KV; both pages
render from that on each request.

Columns:

| Column | Notes |
|---|---|
| `maker` | `Paula` or `John`. Matches the spreadsheet, so it stays short. Decides which section the item lands in. |
| `name` | Product name as it appears on the jar. |
| `description` | Ingredients, a sentence. Commas are fine if the cell is quoted. |
| `heat` | `1` to `6`. Drives the flame rating and the card's colour. |
| `price` | Number only, no dollar sign. |
| `price_quart` | Leave empty unless the item comes in quarts. |
| `sold_out` | `yes` to grey the card out, show "All gone", and offer the visitor an **Ask for this** button. |
| `featured` | `yes` to lift the item onto the front page. Up to six per maker. Leave the whole column empty and the front page simply leads with the first six, so a blank column is never an empty shelf. |

Use a spreadsheet that holds nothing but this list. Publishing to web makes it
public, so it should not sit in a file that also has costs or supplier notes
in another tab.

**Schedule.** A second tab, published the same way. Past dates drop off on
their own and the next thirty show, earliest first.

| Column | Notes |
|---|---|
| `date` | `YYYY-MM-DD`, for example `2026-09-06`. The weekday is worked out. |
| `name` | Market or event name. |
| `time` | Free text, for example `8:00am to 1:00pm`. Optional. |
| `address` | Becomes a link that opens Maps. Optional, the row is fine without one. |

The schedule deliberately does not use Google Calendar. Its embed cannot be
styled to match the page, and keeping a calendar alongside the sheet would
mean entering every market twice. The sheet is the only place dates live.

## Before launch

- [ ] Point the JSON-LD `url` and `image` at the custom domain once there is one.
      They currently read `hotstuff.rwickliffe.workers.dev` (interim)
- [ ] Swap `images/logo.jpg` for the unwatermarked logo
- [ ] Point the Square buttons at the real store, they are `href="#"` today
- [ ] Flip `LIST_ENABLED` to `true` only after `RESEND_SEGMENT_ID` is *their*
      Resend Segment (not yours — see ops.md)
- [ ] Move the repo to their GitHub organization and the Worker to their
      Cloudflare, then re-point JSON-LD and the CI badge
- [ ] Confirm product names, prices and heat ratings with Paula and Crazy John
- [ ] Have each of them tick `featured` for the jars they want on the front
      page. Until they do, it leads with whatever is at the top of their tab
- [ ] Delete the preview scaffolding: the `.draft` CSS block and the
      `<div class="draft">` ribbon

## Working on it

```bash
npm run build && npx wrangler dev   # site + mail, same origin
```

Wrangler reads `wrangler.jsonc` at the repo root and serves `dist/client`
(the Astro build) plus `src/worker/index.ts`. There is no `worker/` directory
and no static HTML floor to preview with a folder server: `public/` is CSS,
images, `site.js`, and `flame.svg`. Rebuild after `.astro` changes, then
re-run wrangler.

**The pages need that stack. Opening a file from disk does not run the Worker
or Astro, so there are no product grids.** Always view it over
`http://localhost` from `wrangler dev`. The published site is https, where
none of this applies.

Regenerate the served images from the originals in `source/`. That folder is
gitignored and stays on the developer's machine: the originals are full-size
shots in which the jar labels and a bottle crop show the owners' home address.
The commands below are therefore a record of how everything in `images/` was
produced rather than something runnable from a fresh clone - ask for the
originals if you need to redo a crop.

```bash
magick source/product-lineup.jpg -resize 1600x -quality 76 images/lineup.jpg
magick source/booth.jpg          -resize 1400x -quality 78 images/booth.jpg
magick source/logo-watermarked.jpg -resize 560x -quality 82 images/logo.jpg
```

Three more are cropped from the originals. They are shipped at 520px on
purpose: the jar labels carry their home address, and at this size it is not
legible. The bottle crop also stops above the address line.

```bash
magick source/517364888_*.jpg -crop 1700x1010+250+120 +repage -resize 520x \
  -modulate 112 -quality 82 images/paula-pickles.jpg
magick source/484479420_*.jpg -crop 1230x700+330+130 +repage -resize 520x \
  -quality 82 images/john-bottles.jpg
magick source/585894050_*.jpg -crop 720x470+0+400 +repage -resize 520x \
  -quality 82 images/pepper-mash.jpg
```

If you swap any image, update the `width` and `height` attributes on its
`<img>` to the new intrinsic size. They are what reserves the box before the
image loads. The `img { height: auto }` rule in the stylesheet has to stay
with them: those attributes are presentational hints, so without it the
height is pinned to the intrinsic pixel value and every image stretches.

## The two pages

The front page shows what the sheet's `featured` column marks, capped at six a
maker, and links on to the catalog with a live count: *See all 34 of Crazy
John's*. The link hides itself when there is nothing more to see, so a maker
with four jars does not get a link to a page showing the same four.

The heat filter lives on `/products` and not on the front page. Filtering
six hand-picked jars sorts nothing; filtering forty is the reason the control
exists.

**Asking for what is out.** Stock rotates, so jars are out often and that is
ordinary. A sold-out card carries an *Ask for this* button, which drops the
product into the contact form:

> Is "Smoked Ghostly Salsa" coming back? I would like some when it is.

From the front page it scrolls down to the form. From the catalog it travels,
carrying the name in the address (`/?ask=...#write`) and clearing it
out of the address bar on arrival. Requests land in the same inbox as any
other note, which is the whole mechanism: counting how many people asked for a
thing needs no database, only a mail folder and a consistent sentence to
search for.

## Without JavaScript

The catalog is rendered on the Worker from KV, so a visitor whose browser
never runs the script still gets every jar, its heat rating and its price.
If KV is empty, `data/catalog-snapshot.json` is the floor. Refresh it from
live `/data` when the sheet has meaningfully changed (cron updates KV only,
not this file). A throwing component is a 500 on both pages, not a fallback
to static HTML — the snapshot protects against empty data, not a broken
render.

```bash
tools/pull-catalog.mjs            # data/catalog-snapshot.json
```

**The schedule is rendered with the page**, dropping dates before today.

Nothing else is left sitting there dead. The heat filter and the theme toggle
need script, so they are hidden until one line in the `<head>` marks the page
as scripted. The list signup ships closed and script opens it, rather than the
other way round - it used to ship open and be closed on load, which meant a
scriptless browser showed a signup form for a list that was not taking
signups, with no `action` on it to send anywhere. The contact form is the one
control that cannot simply be hidden, because it is how you reach them, so a
`<noscript>` beside it gives the phone number instead.

## Checks

One command runs everything. It is quiet unless something fails, and exits
non-zero, so it works as a habit before pushing:

```bash
./check
```

`npm test` runs the same command.

It parses the page modules, type-checks the page and the Worker,
confirms the generated art block is current, the catalog snapshot has
products, SITE_CSP matches `public/_headers`, the stylesheet reaches nothing
outside itself, Base.astro is wired to the shared files, the favicon matches
the flame sprite, runs the test suites, type-checks `.astro` files, compiles
with `astro build`, and runs `prettier --check` on JS/TS/Astro/JSON. It does
not format Python or this `check` script. Nothing touches the network.

```bash
node --test test/lib/csv.test.mjs test/lib/timezone.test.mjs test/lib/html-cache.test.mjs test/domain/heat-scale.test.mjs test/domain/products.test.mjs test/domain/page-catalog.test.mjs test/worker/api.test.mjs test/worker/catalog.test.mjs
npm run types                                               # wrangler Env types
npm run check:types                                         # tsc + astro check
npx prettier --check "**/*.{js,ts,mjs,astro,json}"          # JS/TS/Astro/JSON
tools/make-assets.py --check      # generated art is up to date
npm run build                     # astro build
```

The type check is the only step that needs anything installed. On a fresh
clone it prints a note and skips, so `./check` still runs with nothing fetched;
CI runs `npm ci` first, which is what makes it stricter than a bare clone
rather than merely different. Dev dependencies are `typescript`, the Workers
runtime types, `wrangler`, `@astrojs/check`, Playwright, and Prettier. Nothing
is shipped from `node_modules`: Astro builds the site and wrangler bundles the
Worker at deploy.

Playwright is a second command. It builds, boots `wrangler dev`, and clicks
through the heat filter, legend, ask buttons, and `?debug`. GitHub Actions
runs `./check` then this on every push, so the badge above and a clean local
`./check` plus `npx playwright test` mean the same thing:

```bash
npx playwright test
```

First time on a machine: `npx playwright install chromium`.

`test/lib/csv.test.mjs` covers CSV parsing and the date parser;
`test/domain/heat-scale.test.mjs` covers the heat scale. Rather than keep a
second copy of them, they import what ships - there is no second copy to
drift, and renaming one breaks the import rather than quietly testing
something that no longer exists.

`test/worker/api.test.mjs` covers token signing and expiry, email and HTML
validation, password comparison, request-size limits, and the existing-contact
Segment path. It stubs `fetch`, so no mail is ever sent.

## Checking that the sheets are actually being read

Add `?debug` to any url, including the live site:

```
https://paulassalsa.com/?debug
```

A small panel appears in the corner reporting where each dataset came from:

```
data sources
products   live KV (18 rows)
events     live KV (6 rows)
```

`live KV` in green means the Worker served rows from catalog storage.
`snapshot` means KV was empty and the committed floor was used. Orange
`empty` means neither had rows. After changing the spreadsheet, load the
site with `?debug` and **confirm the row count and `fetchedAt` moved.**
Without the flag no panel renders, and there is nothing for a visitor to
stumble across.

Errors are also written to the browser console, but that is only useful with
devtools already open. Worker observability covers the mail routes; a bad
sheet fetch in the browser still only shows in the console (and `?debug`).

## Generated art

The torn print edges, the barbed wire, the paper grain and the stains on each
photograph are all procedural, generated once and baked into the stylesheet as
custom properties inside a marked block:

```bash
tools/make-assets.py            # rewrite the block in styles.css
tools/make-assets.py --check    # fail if the block is out of date
```

The generator emits **values only**, never selectors: the stylesheet decides
what `var(--tear-booth)` or `var(--stain-jars)` is applied to. Renaming a class
therefore cannot silently disconnect the art from the page.

Seeds are fixed, so output is byte-stable and a run with no source change is a
no-op. The four prints each get their own seed, their own torn edges and their
own ripped corner, plus a random scatter of stains. Change a print's seed to
reshuffle just that sheet. Note that retuning any stain or tear parameter
reshuffles the ones after it too: `randint` consumes a variable amount of the
random stream depending on its range. The geometry carries its own assertions -
a mask polygon that crosses itself renders as a slash across the photograph
rather than an edge, so the build refuses to emit one.

Earlier the page shipped in two cuts, a plain one and this one, kept in sync by
a `build-horror.py` generator. They only ever wanted this one, so the styling
was merged into `index.html` and the generator retired. The two experiments it
carried behind flags - a canvas and a CSS halftone over the hero photograph,
and a 1977 rating box and billing block - are in git history:

```bash
git log --diff-filter=D -- build-horror.py     # find the commit that removed it
git show <sha>^:build-horror.py                # read the last version
```

## Hosting

The site and the mail API are one Cloudflare Worker (`hotstuff`). Astro builds
into `dist/`; Wrangler serves `dist/client` as Static Assets (CSS, images,
`_headers`) and runs `src/worker/index.ts` for HTML, mail, `/data`, and cron.
Interim public URL:

`https://hotstuff.<account>.workers.dev`

GitHub stays the repo and runs `./check` in Actions. GitHub Pages is not used.
`tools/`, `src/`, `data/`, and the README are not served as source — only the
build output and the Worker.

Local preview of the full stack:

```bash
npm run build && npx wrangler dev
```

At launch the repo still moves to an organization Paula owns, and a custom
domain on their Cloudflare account replaces `workers.dev`. Until then, Web
Analytics is the dashboard snippet (automatic injection needs a proxied zone).

### Custom events (asks and mail)

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

Keep the repo public: Actions and a custom domain's certificate stay free on a
public repo, the developer's commits keep their authorship after a transfer,
and whoever comes next can fork it.

Nothing in the live data path depends on the developer's account, and it needs
to stay that way. The Worker cron pulls the sheet into *their* Cloudflare KV;
a stalled job in somebody else's account would freeze their prices with no
error they can see.

Register the name at Cloudflare if they have the TLD (they do for `.com`).
At-cost, privacy included, and it is the same login as the Worker and
Email Routing. Porkbun if Cloudflare does not sell that TLD, then point
the nameservers at Cloudflare. Skip GoDaddy. Auto-renew on. Do not buy
the registrar's email or website builder.

## Mail

Contact form and confirmed newsletter signup run through the same Worker that
serves the site, plus Resend. The page POSTs JSON as `text/plain` to relative
paths (`/contact`, `/subscribe`). `MAIL_ENABLED = false` in `public/site.js` leaves the
forms on the page but idle — they do not POST.

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

Account ownership and handoff steps stay in local `ops.md` (gitignored).

### Why the script is split in two

`src/lib/csv.js` and `src/lib/grid.js` hold the generic functions with no DOM
and no network in them. The heat scale lives in `src/domain/heat-scale.js`.
`site.js` holds everything that touches the page. The seam is not arbitrary
- it is exactly the line the tests already drew, so `test/lib/csv.test.mjs`
can import the real modules instead of extracting functions from a file by
counting brackets, which is what it used to do in forty-nine lines that no
longer exist.

Both pages load `site.js` as `type="module"`, which means it is deferred and
runs after parsing rather than partway through it.

### Types, without the page gaining a build step

Both halves are type-checked. They get there differently, because they are not
in the same position.

The Worker already had a build step - `wrangler` bundles it with esbuild on
every deploy and takes a `.ts` entry directly - so `.ts` costs it nothing
structurally, and it is written in TypeScript.

`public/site.js` is still a static asset — copied through the Astro build, not
bundled — so it stays JavaScript and is annotated with JSDoc, checked by
`tsc --noEmit` under `checkJs`. The types are comments. **The file that ships
is the file in the repo**, byte for byte: nothing compiles it, and what you
read is what the browser runs. Editors that pick the default `tsconfig.json`
type-check the `.astro` files; `site.js` lives in `tsconfig.site.json`, which
`./check` and `npm run check:types` run.

`MailResult` is a JSDoc `@typedef` in `site.js` itself. Nothing in `public/`
is there just for types — that directory is served verbatim.

That check is not decoration. Turning it on found three places that were right
only by accident: `isNaN(d)` passed a Date where a number was expected and
worked through coercion; `new Error(response.status)` did the same with a
number where a string belongs; and `syncToggleLabel` dereferenced the theme
toggle with the null guard sitting in its caller, one call site away from
throwing on a page that has no toggle. It also found the schedule hanging a
`Date` on the string-keyed sheet rows as `_d` and then sorting with
`a._d - b._d`, subtracting one object from another.

Wrangler is run through `npx wrangler ...` rather than installed globally, so
there is nothing to keep in step across machines:

```bash
npx wrangler deploy --dry-run    # bundle without uploading, to check a change
npx wrangler deploy              # into whichever account is logged in
npx wrangler secret put NAME
```

What that buys is typed `Env`. Rate-limit bindings come from
`npx wrangler types --include-runtime false`; secrets are merged in
`env.d.ts` because they live in the dashboard, not in `wrangler.jsonc`. A
misspelt binding used to read `undefined` and surface much later as a
confusing Resend error. It is now a compile error that suggests the right
name.

Two things worth knowing if you touch it. `node --check` cannot read a `.ts`
file - it parses it as CommonJS and trips on the first `export` - which is why
that check is the type checker instead. And `test/worker/api.test.mjs` imports
the `.ts` source directly, relying on Node stripping the types at run time,
which needs Node 22.18 or newer.

## Later

One thing they have asked for that a static page cannot do alone: a
catalog that matches Square on a busy market day. Stay on the Worker. The
mail routes and Resend already cover contact and the list. Secrets live on
the Worker, never in this repo.

Do not add a form vendor plus a newsletter vendor. That is two accounts
and still cannot receive Square webhooks. Do not use Google Forms (cannot
match the page) or Apps Script (the browser CORS path is a pile of tricks
they would inherit). Do not collect addresses in the spreadsheet and BCC
from Gmail.

Names and emails from the forms go to Resend, not GitHub.

Do not build this on AWS. It is the same jobs with a billing alarm and a
SES sandbox ticket. One Worker and Resend stay cheaper and
smaller.

Account ownership and how to develop against a personal Worker stay out
of this file.

### Their inbox

Resend sending from `@their-domain` (SPF, DKIM) is not a mailbox.
Customers still cannot write to it.

For humans: Cloudflare Email Routing, free, into the Gmail they already
use. `orders@` or a catch-all. They reply from Gmail. A `gmail.com` From
is fine until they ask otherwise. Google Workspace is nicer mail, not
cheaper mail (~$7/user/month). Do not use Resend as their inbox.

### Square catalog and stock

Crazy John adds two or three jars a week and they already keep inventory
in Square. The products tab would be a second copy. Square becomes the
source of truth. The events tab stays: Square is not a calendar.

A GitHub Action on a daily cron was the static-site idea: pull Square
Catalog into a committed file. That Action was never built, and it is the
wrong shape now. Catalog refresh already lives on the Worker (sheet → KV).
If Square becomes the source, that fetch belongs there too — not a
commit-on-cron Action.

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

### Cost

Cloudflare Workers and Resend's free tiers cover a salsa shop (Resend:
3,000 transactional mails a month and 100/day, 1,000 newsletter contacts;
confirm whether broadcasts share the daily cap). Square Marketing is a
paid add-on; skip it unless they already want to pay Square for email.

## Notes

The product names and ingredients were read off photographs of the jar
labels and still need confirming. Their street address is deliberately absent:
the labels carry one because the Texas Cottage Food Law requires it, but that
is their home and it does not belong on a website.
