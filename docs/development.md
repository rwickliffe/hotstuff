# Development

## Running it

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

The served images come from originals in `source/`, which is gitignored, so
the commands below are a record of how most of `public/images/` was produced
rather than something a fresh clone can run. Ask for the originals if you need
to redo a crop.

```bash
magick source/product-lineup.jpg -resize 1600x -quality 76 public/images/lineup.jpg
magick source/booth.jpg          -resize 1400x -quality 78 public/images/booth.jpg
magick source/logo-watermarked.jpg -resize 560x -quality 82 public/images/logo.jpg
```

Three more are cropped from the originals and shipped at 520px. Keep that size
and those crops; the private ops notes explain why.

```bash
magick source/517364888_*.jpg -crop 1700x1010+250+120 +repage -resize 520x \
  -modulate 112 -quality 82 public/images/paula-pickles.jpg
magick source/484479420_*.jpg -crop 1230x700+330+130 +repage -resize 520x \
  -quality 82 public/images/john-bottles.jpg
magick source/585894050_*.jpg -crop 720x470+0+400 +repage -resize 520x \
  -quality 82 public/images/pepper-mash.jpg
```

If you swap any image, update the `width` and `height` attributes on its
`<img>` to the new intrinsic size. They are what reserves the box before the
image loads. The `img { height: auto }` rule in the stylesheet has to stay
with them: those attributes are presentational hints, so without it the
height is pinned to the intrinsic pixel value and every image stretches.

## How the pages behave

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

### Without JavaScript

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
as scripted. The list signup ships closed and script opens it, so a scriptless
browser never shows a form it cannot send. The contact form is the one control
that cannot simply be hidden, because it is how you reach them, so a
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
with `astro build`, confirms the Node floor covers every locked package, and
runs `prettier --check` on JS/TS/Astro/JSON. It does
not format Python or this `check` script. Nothing touches the network.

```bash
node --test test/lib/*.test.mjs test/domain/*.test.mjs test/worker/*.test.mjs
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

## Code layout

### What a similar project keeps

`src/lib/` is generic: a similar project keeps it. `src/domain/` is this
business's own: they replace it. Pages and the Worker call the domain names;
the modules underneath take field names, predicates, and caps as arguments.

### Why the script is split in two

`src/lib/csv.js` and `src/lib/grid.js` hold the generic functions with no DOM
and no network in them. The heat scale lives in `src/domain/heat-scale.js`.
`site.js` holds everything that touches the page. The seam is the line the
tests already drew, so `test/lib/csv.test.mjs` can import the real modules
rather than extract functions from a file.

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

Writing the Worker in TypeScript also buys a typed `Env`. Rate-limit bindings come from
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

## Deploying

Deploys are by hand, so a merge ships nothing until someone runs
`npx wrangler deploy`.

Wrangler is run through `npx wrangler ...` rather than installed globally, so
there is nothing to keep in step across machines:

```bash
npx wrangler deploy --dry-run    # bundle without uploading, to check a change
npx wrangler deploy              # production, on the account_id in wrangler.jsonc
# Not private staging: the URL is public to anyone who can guess it, and it runs
# on the real KV, secrets and mail bindings. Disable version URLs or put them
# behind Cloudflare Access to close that; try anything destructive in `wrangler dev`.
npx wrangler versions upload --preview-alias next   # a public URL, not live
npx wrangler versions deploy     # promote that version
npx wrangler rollback            # back to the previous one
npx wrangler secret put NAME
```

## Previews, for changes someone else has to look at

A version URL runs on production's bindings. A **Preview** is a per-branch
deployment with its own, configured by the `previews` block in
`wrangler.jsonc` — its own KV namespace, its own metrics dataset, its own
secrets. That is what makes it safe to point at a Square sandbox, or a copy of
the spreadsheet with deliberately broken rows in it, and then send the URL to
Paula and John.

```bash
npx wrangler preview                       # deploys the current git branch
npx wrangler preview secret put NAME       # a secret for this branch only
npx wrangler preview base-config secret    # a secret every preview inherits
npx wrangler preview delete --name NAME    # when the branch is merged
```

`wrangler dev` is still the faster loop and still the place for anything
destructive. Reach for a preview when the point is that somebody other than
you needs to click it.

Five things to know before relying on one:

- **Nothing is inherited.** A preview gets only what the `previews` block
  names, which is why that block repeats the bindings rather than extending
  them. Leave `kv_namespaces` out and `CATALOG` is simply unbound; a preview
  writes the live catalog only if production's id is copied in. The same goes
  for the rate-limit `namespace_id`s, which are shared across Workers.
- **Its own spreadsheet.** `previews.vars` reads a copy of the live sheet, so
  bad rows typed into the copy never reach the site. Rows can drift freely, but
  columns can't: add or rename a column in the live sheet and do the same in
  the copy, or previews break on a difference production doesn't have.
- **No cron.** Triggers target production, so a preview's KV stays empty until
  something requests `/data`. Prime it once, the same way the first production
  deploy was primed. An unprimed preview still looks healthy because it renders
  the committed floor, so check `fetchedAt` in `/data` or `?debug`, not the
  page. Edits to the copy don't show up on their own: a payload under an hour
  old is fresh, so `/data` doesn't refresh it. To see an edit now, delete the
  `catalog` key from `hotstuff-catalog-preview`, and the next `/data` refreshes
  synchronously and returns the result. Past the hour, request `/data` twice:
  the first returns the old payload and refreshes behind it, and the second
  gets the new one.
- **No routes.** A preview is reachable on `workers.dev` only, never the
  custom domain.
- **The URL is public**, like a version URL. Nothing confidential is exposed,
  but an unfinished feature is reachable by anyone holding the link.

Secrets live on Cloudflare rather than in this repo, so `wrangler preview
secret list` is the only record of what a preview has. Base-config secrets —
the ones that make every preview use a developer's Resend account instead of
Paula's — are account state that nothing here can show you.
