# The Google Sheet

One spreadsheet drives the catalog, the schedule, the announcement band and
the how-to videos. Paula edits the sheet; the Worker fetches the published CSVs
on a cron (and when `/data` is cold or stale) and stores them in KV. Pages
render from KV. If KV is empty, they fall back to `data/catalog-snapshot.json`.
The browser never talks to Google.

The CSV publish URLs live in `wrangler.jsonc` under `vars`, one per tab.
Each must end in **`output=csv`**.

```js
// wrangler.jsonc → vars (not secrets)
PRODUCTS_CSV_URL       // products tab
EVENTS_CSV_URL         // events tab
ANNOUNCEMENTS_CSV_URL  // announcements tab
VIDEOS_CSV_URL         // videos tab
```

`ANNOUNCEMENTS_CSV_URL` and `VIDEOS_CSV_URL` are the optional sources. Their
tabs are published and empty most of the time, and no rows is a success, not
an error — so the band and the video section simply do not render. Blanking
either URL turns that feature off the same quiet way. Products and events
stay required, and a blank URL for either is reported as `url empty`.

## Publishing a tab

The sheet already exists. There is no CSV in this repo to import.
Publish each tab with File, Share, Publish to web, picking that tab by name
and CSV as the format, with "Automatically republish when changes are made"
left ticked. One address per tab. Each must end in **`output=csv`**, like this:

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

## Catalog

The `products` tab. The Worker stores it in KV; both pages
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

## Schedule

A second tab, published the same way. Past dates drop off on
their own and the next thirty show, earliest first.

| Column | Notes |
|---|---|
| `date` | `YYYY-MM-DD`, for example `2026-09-06`. The weekday is worked out. |
| `name` | Market or event name. |
| `time` | Free text, for example `8:00am to 1:00pm`. Optional. |
| `address` | Becomes a link that opens Maps. Optional, the row is fine without one. |

## Announcements

A third tab, published the same way. One row shows at a
time, at the very top of the page; most of the time the tab is empty and
nothing renders at all.

| Column | Notes |
|---|---|
| `date` | `YYYY-MM-DD`. Shown as a small date chip, and breaks ties when two rows are equally loud. |
| `headline` | The sentence itself. A row without one is ignored. |
| `expires` | `YYYY-MM-DD`, optional. The row shows through the end of that day in Texas, then stops on its own. Blank never expires. |
| `link` | Optional. `#find`, `#watch`, or a full address. |
| `link_text` | Optional wording for that link. Defaults to `More`. |
| `priority` | Optional: `quiet`, blank, or `urgent`. See below. |

`priority` is the only lever on how visible a row is, and it moves two things
at once:

| Value | Looks like | Appears on |
|---|---|---|
| `quiet` | Paper strip, ink text, no red | The front page |
| blank or anything unrecognised | The chile red band | The front page |
| `urgent` | The red band, larger type | **Every page** |

Anything the sheet does not recognise is treated as an ordinary
announcement, so a typo is quiet rather than loud. Nothing has to be deleted
to take a notice down: set `expires`, or post a louder row.

## Videos

A fourth tab. The site never serves video: YouTube hosts it, and
these rows are a list of links. The front page shows three and links to
`/videos`, which shows the lot, newest first — the same shape as the catalog
and `/products`.

| Column | Notes |
|---|---|
| `video` | The YouTube address. Paste whatever is in the browser bar: a `watch?v=` link, a `youtu.be` short link, a Shorts link, or the bare id. A row whose address has no id in it is dropped rather than shown as a dead tile. |
| `title` | What it is called. A row without one is ignored. |
| `description` | A sentence under the title. Optional. |
| `date` | `YYYY-MM-DD`, optional. Sorts newest first; undated rows go last. |
| `featured` | `yes` to pin it to the front page. Optional — with nothing featured, the three newest show. |

Cards are poster frames that link out, not embeds. Nothing of YouTube's
loads until someone chooses to go there, which is why there is no cookie
banner and why `img-src` admits `i.ytimg.com` and nothing else.

The schedule deliberately does not use Google Calendar. Its embed cannot be
styled to match the page, and keeping a calendar alongside the sheet would
mean entering every market twice. The sheet is the only place dates live.

## Checking that the sheets are being read

Add `?debug` to any url, including the live site:

```
https://paulaandcrazyjohn.com/?debug
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
