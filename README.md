# Paula and Crazy John's Hot Stuff

[![check](https://github.com/rwickliffe/hotstuff/actions/workflows/check.yml/badge.svg)](https://github.com/rwickliffe/hotstuff/actions/workflows/check.yml)

Website for a small-batch salsa, hot sauce, cowboy candy, pickle and chow chow
maker in Elgin, Texas, who sell at farmers markets and community events.

A single static page. No build step, no framework, no server. Open
`index.html` in a browser and it works.

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
Contact notes and newsletter signups go to Resend through the Worker when
`WORKER_URL` is set — not into this repo.

## Connecting the Google Sheet

One spreadsheet with two tabs drives the page. Each tab is published
separately and gets its own CSV address. Both are constants near the top of
the `<script>` block in `index.html`, and either left empty falls back to the
sample content baked in, so the page always renders.

```js
const PRODUCTS_CSV_URL = "";   // products tab
const EVENTS_CSV_URL   = "";   // events tab
const WORKER_URL       = "";   // Cloudflare Worker, empty = forms idle
const LIST_OPEN        = false; // true only on their Resend Segment
```

`data/products.csv` and `data/events.csv` are importable starting points for
the two tabs. In Google Sheets: File, Import, Upload, and choose "Insert new
sheet". Rename the resulting tabs `products` and `events`.

Publish each tab with File, Share, Publish to web, picking that tab by name
and CSV as the format, with "Automatically republish when changes are made"
left ticked. Two tabs means two addresses. Each must end in **`output=csv`**, like this:

```
https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=685501268&single=true&output=csv
```

Two lookalikes that do not work, both returning HTML rather than CSV:

- `.../pubhtml?gid=...` is the Web page format. Pick Comma-separated values instead.
- `.../edit#gid=...` is the editor address from the browser bar. It needs a login.

Neither errors. The page fetches them successfully, finds no rows it
recognises, and quietly keeps its built-in list, so the site looks stale
rather than broken. There is a console warning for exactly this case.

Google edge-caches published CSVs, so an edit can take a few minutes to reach
the site. That is usually the explanation when a change does not show up.

**Catalog.** The `products` tab. Replaces the built-in list on page load.

Columns:

| Column | Notes |
|---|---|
| `maker` | `Paula` or `John`. Matches the spreadsheet, so it stays short. Decides which section the item lands in. |
| `name` | Product name as it appears on the jar. |
| `description` | Ingredients, a sentence. Commas are fine if the cell is quoted. |
| `heat` | `1` to `6`. Drives the flame rating and the card's colour. |
| `price` | Number only, no dollar sign. |
| `price_quart` | Leave empty unless the item comes in quarts. |
| `sold_out` | `yes` to grey the card out and show "All gone". |

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
      They currently read `rwickliffe.github.io/hotstuff`, which is correct until then
- [ ] Swap `images/logo.jpg` for the unwatermarked logo
- [ ] Point the Square buttons at the real store, they are `href="#"` today
- [ ] Set `WORKER_URL` to the live Worker once contact mail is ready to ship
- [ ] Drop `http://localhost:8765` from the Worker's CORS allowlist, and add the
      custom domain. It is there so the contact form can read the Worker's reply
      during local development
- [ ] Flip `LIST_OPEN` to `true` only after `RESEND_SEGMENT_ID` is *their*
      Resend Segment (not yours — see ops.md)
- [ ] Confirm product names, prices and heat ratings with Paula and Crazy John
- [ ] Delete the preview scaffolding: the `.draft` CSS block and the
      `<div class="draft">` ribbon

## Working on it

```bash
python3 -m http.server 8765     # then open http://localhost:8765
```

**Do not open `index.html` straight off disk.** From a `file://` path the
browser treats the page as having no origin and blocks the requests to Google,
so both sheets fail and the page quietly falls back to its built-in sample
products and dates. It looks like it works. It is just not reading the
spreadsheet. There is a console warning saying so. Always view it over
`http://localhost`, and note that the published site on GitHub Pages is
served over https, where this is a non-issue.

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

Build a single self-contained file with the images inlined, for emailing or
dropping on a host as one file:

```bash
tools/inline.sh index.html dist/index.html
```

## Checks

One command runs everything. It is quiet unless something fails, and exits
non-zero, so it works as a habit before pushing:

```bash
./check
```

It parses the page script and the Worker, confirms the generated art block is
current, runs both test suites, and rewrites the sheet URLs to local fixtures.
Nothing touches the network. GitHub Actions runs the same command on every
push, so the badge above and a clean local run mean the same thing. The pieces run on their own too:

```bash
node --test tools/ worker/        # both suites
tools/make-assets.py --check      # generated art is up to date
tools/test-integrations.sh        # sheet plumbing
```

`tools/test-parsing.mjs` covers the page's pure data functions - CSV parsing,
the date parser, the heat scale. Rather than keep a second copy of them, it
lifts the real functions out of `index.html` by name, so renaming one fails
loudly instead of quietly testing something that no longer exists.

`worker/test-worker.mjs` covers token signing and expiry, email and HTML
validation, password comparison, request-size limits, and the existing-contact
Segment path. It stubs `fetch`, so no mail is ever sent.

`tools/test-integrations.sh` writes `integration-test.html` wired to local
stand-ins, and works whatever the constants currently hold. That part is
manual: serve the folder and open it. You should see the three products from
`data/fixtures/products.csv` in place of the real catalog, and three events
from `data/fixtures/events.csv` in place of the sample dates. The 2020 row in
that file must not appear: it is there to prove past dates get dropped.

## Checking that the sheets are actually being read

Add `?debug` to any url, including the live site:

```
https://paulassalsa.com/?debug
```

A small panel appears in the corner reporting where each dataset came from:

```
data sources
products   live sheet (18 rows)
events     live sheet (6 rows)
```

`live sheet` in green means the spreadsheet was read. `built-in list` or
`built-in dates` in orange means it was not, and the page is showing the
samples baked into the file, with the reason underneath.

This matters because the fallback is deliberately invisible to customers. A
broken sheet produces a page that looks completely normal and is quietly out
of date, so **after changing the spreadsheet, load the site with `?debug` and
confirm the row count moved.** Without the flag no panel renders, and there is
nothing for a visitor to stumble across.

Errors are also written to the browser console, but that is only useful with
devtools already open. There is no server-side logging: GitHub Pages is static
hosting, so nothing is recorded anywhere.

## Generated art

The torn print edges, the barbed wire, the paper grain and the stains on each
photograph are all procedural, generated once and baked into the stylesheet as
custom properties inside a marked block:

```bash
tools/make-assets.py            # rewrite the block in index.html
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

GitHub Pages serves this repo as-is: Settings, Pages, deploy from `main`,
root. A custom domain can be attached later in the same place. Keep the
repo public. Pages, Actions, and a custom domain's HTTPS certificate are
free on a public repo; the only recurring bill is the domain itself.

Register the name at Cloudflare if they have the TLD (they do for `.com`).
At-cost, privacy included, and it is the same login as the Worker and
Email Routing. Porkbun if Cloudflare does not sell that TLD, then point
the nameservers at Cloudflare. Skip GoDaddy. Auto-renew on. Do not buy
the registrar's email or website builder.

## Mail

Contact form and confirmed newsletter signup run through one Cloudflare
Worker and Resend. The page POSTs JSON as `text/plain` to `WORKER_URL`
(next to the sheet URLs in `index.html`). Empty means the forms stay on
the page but do not send.

- **Contact** is transactional: Resend emails Paula, Reply-To is the
  visitor. Nothing is stored. Safe to point at your Worker while
  developing.
- **Newsletter** is double opt-in. `/subscribe` only sends a confirm
  mail; `GET /confirm` shows a button; `POST /confirm` adds them to the
  Segment. Contacts are global in Resend; a Segment is a named group of them,
  found under Audience in the dashboard, and a Broadcast targets one Segment.
  Keep `LIST_OPEN = false` on the public site until that Segment is *theirs*.
  A CSV export is not a consent record.
- **Broadcasts** wait on `BROADCAST_POSTAL_ADDRESS` (a PO box they will print).
  `/send` refuses without it. Compose lives at the Worker `/compose` URL,
  not in the nav. Generate `BROADCAST_PASSWORD` with `openssl rand -base64 24`.

Resend free tier: 3,000 transactional mails a month **and** 100/day, plus
1,000 marketing contacts. Confirm in the dashboard whether broadcasts
share the daily cap before the first real send. Do not loop the
transactional Send API over the list.

Open `?debug` to see whether `WORKER_URL` is set, and after a failed mail
attempt whether the note says `Resend daily cap` or `could not reach`.

Account ownership and handoff steps stay in local `ops.md` (gitignored).

## Later

One thing they have asked for that a static page cannot do alone: a
catalog that matches Square on a busy market day. Stay on Pages. The
Worker and Resend already cover contact and the list. Secrets live in
Actions and on the Worker, never in this repo.

Do not add a form vendor plus a newsletter vendor. That is two accounts
and still cannot receive Square webhooks. Do not use Google Forms (cannot
match the page) or Apps Script (the browser CORS path is a pile of tricks
they would inherit). Do not collect addresses in the spreadsheet and BCC
from Gmail.

Names and emails from the forms go to Resend, not GitHub.

Do not build this on AWS. It is the same jobs with a billing alarm and a
SES sandbox ticket. Pages, one Worker, and Resend stay cheaper and
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

A GitHub Action, on a daily cron, pulls Catalog and Inventory and writes
`data/products.csv`. The page already knows how to fetch a CSV. A failed
run must not overwrite the last good file. Same silent fallback as today,
but stale means last successful sync, not the baked-in sample. They never
log into GitHub.

Need from them, once: fifteen minutes with whoever signs into Square, to
create a Developer app on *their* seller account and put the production
token in GitHub secrets. Two fields on each item they already create:
Maker (`Paula` or `John`; a category each is fine) and Heat (`1` to `6`).
Name, description, price, and pint vs quart already live in Square. Stamp
heat and maker on the current list from the sheet so they are not
retyping. Ask once how they mark sold out (quantity hits zero, they hide
it, or they archive it) and whether quarts are a second variation or a
separate item.

A daily CSV is fine for names, heat, and prices. It is not fine for stock
during a market. Square can push `inventory.count.updated`; Pages has
nowhere for that to land. Do not commit on every sale. That waits on an
Action and a Pages deploy, and a busy booth would spam rebuilds.

The Worker receives the webhook and writes a public `stock.json`. The
page fetches it the same way it fetches the sheet. If the Worker is down,
keep the last file or hide the sold-out badges. An open tab from the
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
