# Paula and Crazy John's Hot Stuff

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

Ordering and payment happen on Square, so this site never touches money or
customer data.

## Connecting the Google Sheet

One spreadsheet with two tabs drives the page. Each tab is published
separately and gets its own CSV address. Both are constants near the top of
the `<script>` block in `index.html`, and either left empty falls back to the
sample content baked in, so the page always renders.

```js
var PRODUCTS_CSV_URL = "";   // products tab
var EVENTS_CSV_URL   = "";   // events tab
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
their own and the next six show, earliest first.

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

- [ ] Replace both `REPLACE_ME.com` values in the JSON-LD block with the real domain
- [ ] Swap `images/logo.jpg` for the unwatermarked logo
- [ ] Point the Square buttons at the real store, they are `href="#"` today
- [ ] Confirm product names, prices and heat ratings with Paula and Crazy John
- [ ] Delete the preview scaffolding: the `.draft` CSS block, the `<div class="draft">`,
      and the type picker at the end of the script.
- [ ] Trim the Google Fonts link to the one chosen family set

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

Regenerate the served images from the originals in `source/`:

```bash
magick source/product-lineup.jpg -resize 1600x -quality 76 images/lineup.jpg
magick source/booth.jpg          -resize 1400x -quality 78 images/booth.jpg
magick source/logo-watermarked.jpg -resize 560x -quality 82 images/logo.jpg
```

Build a single self-contained file with the images inlined, for emailing or
dropping on a host as one file:

```bash
./inline.sh index.html dist/index.html
```

Check that both live-data paths still work after any edit:

```bash
./test-integrations.sh
```

That writes `integration-test.html` wired to local stand-ins, and works
whatever the constants currently hold. Serve the folder and open it. You
should see the three products from `data/live-products.csv` in place of the real
catalog, and three events from `data/live-events.csv` in place of the sample
dates. The 2020 row in that file must not appear: it is there to prove past
dates get dropped.

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

## The horror cut

`horror.html` is an alternate styling of the same page, leaning into
grindhouse slasher. It is generated, never hand edited:

```bash
./build-horror.py
```

It rewrites the palette, the type, the heat words and some wording, and
leaves the behaviour alone. Run it after any change to `index.html`. If a
substitution stops matching it fails loudly rather than producing a half
updated page.

## Hosting

GitHub Pages serves this repo as-is: Settings, Pages, deploy from `main`,
root. A custom domain can be attached later in the same place.

## Notes

The product names and ingredients were read off photographs of the jar
labels and still need confirming. Their street address is deliberately absent:
the labels carry one because the Texas Cottage Food Law requires it, but that
is their home and it does not belong on a website.
