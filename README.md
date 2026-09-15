# Paula and Crazy John's Hot Stuff

[![check](https://github.com/rwickliffe/hotstuff/actions/workflows/check.yml/badge.svg)](https://github.com/rwickliffe/hotstuff/actions/workflows/check.yml)

Website for a small-batch salsa, hot sauce, cowboy candy, pickle and chow chow
maker in Elgin, Texas, who sell at farmers markets and community events.

A static site hosted on one Cloudflare Worker: two HTML pages, one stylesheet,
three ES modules under `public/`, and a Google Sheet the owners edit themselves.
No framework. Catalog freshness still waits on a deploy until a later phase.

`public/index.html` leads with a handful of featured jars per maker.
`public/products.html` carries the full list, which runs to sixty-odd items and
turns over with the season. Both render from the same sheet through the same
`public/site.js`, so there is one copy of every rule about how a jar is drawn.

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
that serves the site (`MAIL` in `public/site.js`) — not into this repo.

## Connecting the Google Sheet

One spreadsheet with two tabs still drives the catalog and schedule. Paula
edits the sheet; the Worker fetches the published CSVs on a cron (and when
`/data` is cold or stale) and stores them in KV. The browser only calls
`GET /data` — it never talks to Google.

The CSV publish URLs live in `worker/wrangler.jsonc` under `vars`
(`PRODUCTS_CSV_URL`, `EVENTS_CSV_URL`). Each must end in **`output=csv`**.

```js
// wrangler.jsonc → vars (not secrets)
PRODUCTS_CSV_URL  // products tab
EVENTS_CSV_URL    // events tab
```

`MAIL` / `LIST_OPEN` stay in `public/site.js`:

```js
const MAIL      = true;  // false = forms idle (static preview without wrangler)
const LIST_OPEN = false; // true only on their Resend Segment
```

`data/products.csv` is an importable starting point for the products tab (and
the source the catalog bake reads). There is no committed events seed — the
schedule lives only in the sheet. In Google Sheets: File, Import, Upload, and
choose "Insert new sheet". Rename the resulting tabs `products` and `events`.

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
recognises, and keeps the catalog already written into the page, so the site
looks stale rather than broken. There is a console warning for exactly this
case.

Google edge-caches published CSVs, so an edit can take a few minutes to reach
the site. That is usually the explanation when a change does not show up.

**Catalog.** The `products` tab. Replaces the baked-in catalog on page load.

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
- [ ] Flip `LIST_OPEN` to `true` only after `RESEND_SEGMENT_ID` is *their*
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
cd worker && npx wrangler dev   # site + mail, same origin
# or, HTML only:
cd public && python3 -m http.server 8765
```

**The pages need a server. `file://` does not work at all any more.** A module
script is fetched under CORS rules and a `file://` document has no origin to
satisfy them, so `site.js` never loads: both product grids and the schedule
come up empty, since all three render from it. Before the
move to modules this failed more quietly - the script ran, the sheet fetches
were blocked, and the page fell back to its built-in list while looking
perfectly fine. The loud version is the better one: an empty page is obviously
wrong, where a stale page is not.

Always view it over `http://localhost` or `wrangler dev`. The published site is served over
https, where none of this applies.

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

The heat filter lives on `products.html` and not on the front page. Filtering
six hand-picked jars sorts nothing; filtering forty is the reason the control
exists.

**Asking for what is out.** Stock rotates, so jars are out often and that is
ordinary. A sold-out card carries an *Ask for this* button, which drops the
product into the contact form:

> Is "Smoked Ghostly Salsa" coming back? I would like some when it is.

From the front page it scrolls down to the form. From the catalog it travels,
carrying the name in the address (`index.html?ask=...#write`) and clearing it
out of the address bar on arrival. Requests land in the same inbox as any
other note, which is the whole mechanism: counting how many people asked for a
thing needs no database, only a mail folder and a consistent sentence to
search for.

## Without JavaScript

The catalog is written into both pages by `tools/make-catalog.mjs`, so a
visitor whose browser never runs the script still gets every jar, its heat
rating and its price:

```bash
tools/make-catalog.mjs            # rewrite the blocks
tools/make-catalog.mjs --check    # fail if they are out of date
```

It builds those cards with `productCard` out of `lib/render.js` - the same
function the browser calls - against a DOM shim. Writing a second renderer here
in string concatenation would work right up until the two drifted, and then it
would be wrong quietly.

**The schedule is deliberately not baked.** It drops dates before today, so its
output depends on when it ran, and a generated file whose `--check` fails every
morning is worse than no generated file. Without script it says where the dates
go up, which is true and is where they go up anyway.

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

It parses the three page modules, type-checks the page and the Worker,
confirms the generated art
block and the baked catalog are current and that the stylesheet reaches nothing
outside itself, checks both pages are wired to the shared files, runs both test
suites, and rewrites the sheet URLs to local fixtures. Nothing touches the network. GitHub Actions
runs the same command on every push, so the badge above and a clean local run
mean the same thing. The pieces run on their own too:

```bash
node --test tools/test-parsing.mjs worker/test-worker.mjs   # both suites
npm run types                                               # both projects
tools/make-assets.py --check      # generated art is up to date
tools/test-integrations.sh        # sheet plumbing
```

The type check is the only step that needs anything installed. On a fresh
clone it prints a note and skips, so `./check` still runs with nothing fetched;
CI runs `npm ci` first, which is what makes it stricter than a bare clone
rather than merely different. There are three dev dependencies: `typescript`,
the Workers runtime types, and `linkedom`, a DOM shim that lets
`tools/make-catalog.mjs` run the real card renderer in Node. Nothing is shipped
from `node_modules`: the site is static files and wrangler bundles the Worker
at deploy.

`tools/test-parsing.mjs` covers the page's pure data functions - CSV parsing,
the date parser, the heat scale. Rather than keep a second copy of them, it
imports them from `lib/data.js` and runs exactly what ships - there is no
second copy to drift, and renaming one breaks the import rather than quietly
testing something that no longer exists.

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

`live sheet` in green means the spreadsheet was read. Orange means it was not,
and the page is showing the catalog baked into the HTML - or, for the
schedule, nothing at all - with the reason underneath.

This matters because the fallback is deliberately invisible to customers. A
broken sheet produces a page that looks completely normal and is quietly out
of date, so **after changing the spreadsheet, load the site with `?debug` and
confirm the row count moved.** Without the flag no panel renders, and there is
nothing for a visitor to stumble across.

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

The site and the mail API are one Cloudflare Worker (`hotstuff`), with static
files in `public/` via Workers Static Assets. Interim public URL:

`https://hotstuff.<account>.workers.dev`

GitHub stays the repo and runs `./check` in Actions. GitHub Pages is not used.
Only `public/` is served — `tools/`, `data/`, and the README are not on the open
web.

Local preview of the full stack:

```bash
cd worker && npx wrangler dev
```

Static HTML alone (forms idle unless you flip nothing — mail needs the Worker):

```bash
cd public && python3 -m http.server 8765
```

At launch the repo still moves to an organization Paula owns, and a custom
domain on their Cloudflare account replaces `workers.dev`. Until then, Web
Analytics is the dashboard snippet (automatic injection needs a proxied zone).

Keep the repo public: Actions and a custom domain's certificate stay free on a
public repo, the developer's commits keep their authorship after a transfer,
and whoever comes next can fork it.

Nothing in the live data path depends on the developer's account, and it needs
to stay that way. Today the browser reads the spreadsheet directly, so the site
would keep updating from it even if the developer vanished. If that is ever
replaced by a scheduled Worker cron that pulls the sheet, that cron belongs in
*their* Cloudflare — a stalled job in somebody else's account freezes their
prices with no error they can see.

Register the name at Cloudflare if they have the TLD (they do for `.com`).
At-cost, privacy included, and it is the same login as the Worker and
Email Routing. Porkbun if Cloudflare does not sell that TLD, then point
the nameservers at Cloudflare. Skip GoDaddy. Auto-renew on. Do not buy
the registrar's email or website builder.

## Mail

Contact form and confirmed newsletter signup run through the same Worker that
serves the site, plus Resend. The page POSTs JSON as `text/plain` to relative
paths (`/contact`, `/subscribe`). `MAIL = false` in `public/site.js` leaves the
forms on the page but idle — useful for a static folder preview without
`wrangler`.

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

Open `?debug` to see whether mail is `same-origin` or `off`, and after a failed
mail attempt whether the note says `Resend daily cap` or `could not reach`.

Account ownership and handoff steps stay in local `ops.md` (gitignored).

### Why the script is split in two

`lib/data.js` holds the functions with no DOM and no network in them: CSV
parsing, the date parser, the heat scale. `site.js` holds everything that
touches the page. The seam is not arbitrary - it is exactly the line the tests
already drew, so `tools/test-parsing.mjs` can import the real module instead of
extracting functions from a file by counting brackets, which is what it used to
do in forty-nine lines that no longer exist.

Both pages load `site.js` as `type="module"`, which means it is deferred and
runs after parsing rather than partway through it.

### Types, without the page gaining a build step

Both halves are type-checked. They get there differently, because they are not
in the same position.

The Worker already had a build step - `wrangler` bundles it with esbuild on
every deploy and takes a `.ts` entry directly - so `.ts` costs it nothing
structurally, and it is written in TypeScript.

The page has no build step for now, so it stays JavaScript and is annotated
with JSDoc, checked by `tsc --noEmit` under `checkJs`. The types are comments.
**The file that ships is the file in the repo**, byte for byte: nothing
compiles, nothing is generated, and what you read is what the browser runs.

The shapes themselves live in `types.d.ts` as ordinary TypeScript, because
`Sheet` written as a JSDoc `@typedef` is unpleasant to read. `site.js` pulls
the names in with one line:

```js
/** @import { MailResult, Product, Sheet, Source } from "./types.js" */
```

`@import` is a comment, so nothing is imported at run time, and the names stay
scoped to the file rather than becoming ambient globals - delete that line and
the type check fails rather than silently carrying on.

If a later phase adds a real build step, `types.d.ts` is already TypeScript and
would move across untouched.

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
that check is the type checker instead. And `worker/test-worker.mjs` imports
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
