#!/bin/bash
# Produce a single self-contained HTML file: the stylesheet folded back in,
# images and web fonts embedded as data: URIs, nothing left to fetch. For
# emailing, or opening from a USB stick with no network.
#
#   tools/inline.sh [src] [out]        default: index.html -> dist/index.html
#
# Needs network on the way in: the fonts come from Google. The file it writes
# needs none, which is the point.
#
# ponytail: string substitution, not a build tool. Swap for real <img src> +
# a CDN if this ever ships for real.
set -euo pipefail
# Paths below are repo-relative, so run from the repo root wherever invoked.
cd "$(dirname "$0")/.."
src="${1:-index.html}"; out="${2:-dist/index.html}"
mkdir -p "$(dirname "$out")"
cp "$src" "$out"

for f in images/*.jpg; do
  [ -e "$f" ] || continue
  b64=$(base64 -i "$f" | tr -d '\n')
  python3 - "$out" "$f" "$b64" <<'PY'
import sys
out, path, b64 = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(out, encoding="utf-8").read()
s = s.replace('src="%s"' % path, 'src="data:image/jpeg;base64,%s"' % b64)
open(out, "w", encoding="utf-8").write(s)
PY
done

# The page links its stylesheet; the single-file build cannot. Fold it back
# into a <style> block, resolved relative to the source file rather than the
# working directory, so this still works when [src] is somewhere else.
python3 - "$out" "$src" <<'CSS'
import os, re, sys

out, src = sys.argv[1], sys.argv[2]
html = open(out, encoding="utf-8").read()

link = re.search(r'<link rel="stylesheet" href="(?!https?:)([^"]+)">', html)
if not link:
    print("  no local stylesheet link, nothing to fold in")
    sys.exit(0)

path = os.path.join(os.path.dirname(os.path.abspath(src)), link.group(1))
if not os.path.exists(path):
    sys.exit("FAIL: %s links %s, which does not exist" % (src, link.group(1)))

css = open(path, encoding="utf-8").read()
# A closing tag anywhere in the CSS would end the block early and spill the
# rest of the stylesheet into the page as text.
if "</style" in css.lower():
    sys.exit("FAIL: %s contains a </style sequence and cannot be inlined" % path)

html = html.replace(link.group(0), "<style>\n" + css + "</style>")
open(out, "w", encoding="utf-8").write(html)
print("  folded in %s (%d bytes)" % (link.group(1), len(css)))
CSS

python3 - "$out" <<'PY'
import base64, re, sys, urllib.request

out = sys.argv[1]
html = open(out, encoding="utf-8").read()

link = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com/[^"]+)">', html)
if not link:
    print("  no Google Fonts link found, nothing to inline")
    sys.exit(0)

# Google serves different formats per user agent. Ask as a current browser and
# it answers woff2, which every browser that matters has supported for years.
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def fetch(url):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read()


css = fetch(link.group(1).replace("&amp;", "&")).decode("utf-8")

# One @font-face per subset. This page is English, so keep the subsets that
# cover basic Latin and drop cyrillic, greek and the rest - otherwise a single
# family arrives five times over.
kept, dropped = [], 0
for block in re.findall(r'@font-face\s*\{[^}]*\}', css):
    rng = re.search(r'unicode-range:\s*([^;]+);', block)
    if rng and "U+0000-00FF" not in rng.group(1):
        dropped += 1
        continue
    url = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", block)
    if not url:
        continue
    data = base64.b64encode(fetch(url.group(1))).decode("ascii")
    kept.append(block.replace(
        url.group(1), "data:font/woff2;base64," + data))

if not kept:
    sys.exit("FAIL: fetched the font CSS but matched no usable @font-face block")

style = "<style>\n" + "\n".join(kept) + "\n</style>"
html = html.replace(link.group(0), style)
# The preconnects point at hosts nothing asks for any more.
html = re.sub(r'\s*<link rel="preconnect" href="https://fonts\.g[^"]*"[^>]*>', "", html)
open(out, "w", encoding="utf-8").write(html)
print("  inlined %d font faces, dropped %d non-Latin subsets" % (len(kept), dropped))
PY

echo "wrote $out ($(du -h "$out" | cut -f1))"
