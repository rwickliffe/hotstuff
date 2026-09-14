#!/bin/bash
# Regenerates a copy of the site pointed at local stand-ins for both sheets,
# to prove the live-data paths still work after edits.
#
#   catalog  -> data/fixtures/products.csv  replaces the product list
#   schedule -> data/fixtures/events.csv    replaces the sample dates
#
# Substitutes whatever the constants currently hold, so this keeps working
# once the real published URLs are filled in.
set -euo pipefail
# Paths below are repo-relative, so run from the repo root wherever invoked.
cd "$(dirname "$0")/.."

# Fixtures are not shipped in public/ (that would re-open serving raw data).
# Copy them under a gitignored path the browser can fetch when serving public/.
mkdir -p public/_fixtures
cp data/fixtures/products.csv data/fixtures/events.csv public/_fixtures/

# The URLs live in site.js now, so the copy is a pair: a rewritten script and
# a page that points at it instead of the real one.
sed -E \
  -e 's|(var\|let\|const) PRODUCTS_CSV_URL = "[^"]*";|const PRODUCTS_CSV_URL = "/_fixtures/products.csv";|' \
  -e 's|(var\|let\|const) EVENTS_CSV_URL = "[^"]*";|const EVENTS_CSV_URL = "/_fixtures/events.csv";|' \
  public/site.js > public/integration-site.js

sed 's|src="site.js"|src="integration-site.js"|' public/index.html > public/integration-test.html

grep -q '"/_fixtures/products.csv"' public/integration-site.js || { echo "FAIL: catalog URL not substituted";  exit 1; }
grep -q '"/_fixtures/events.csv"' public/integration-site.js || { echo "FAIL: schedule URL not substituted"; exit 1; }
grep -q 'src="integration-site.js"' public/integration-test.html || { echo "FAIL: test page still points at the real script"; exit 1; }

echo "OK. From public/: python3 -m http.server 8765"
echo "Then open: http://localhost:8765/integration-test.html"
echo
echo "Expect in the catalog:  Brand New Peach Salsa, Chow Chow (All gone), Widowmaker."
echo "                        Chow Chow is featured AND out, so it carries the"
echo "                        Ask for this button on the front page."
echo "Expect in the schedule: 3 events, earliest first. The 2020 row must NOT"
echo "                        appear, it tests that past dates are dropped."
