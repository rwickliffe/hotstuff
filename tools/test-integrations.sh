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

sed -E \
  -e 's|(var\|let\|const) PRODUCTS_CSV_URL = "[^"]*";|const PRODUCTS_CSV_URL = "/data/fixtures/products.csv";|' \
  -e 's|(var\|let\|const) EVENTS_CSV_URL = "[^"]*";|const EVENTS_CSV_URL = "/data/fixtures/events.csv";|' \
  index.html > integration-test.html

grep -q '"/data/fixtures/products.csv"' integration-test.html || { echo "FAIL: catalog URL not substituted";  exit 1; }
grep -q '"/data/fixtures/events.csv"' integration-test.html || { echo "FAIL: schedule URL not substituted"; exit 1; }

echo "OK. Serve the folder and open: http://localhost:8765/integration-test.html"
echo
echo "Expect in the catalog:  Brand New Peach Salsa, Chow Chow (All gone), Widowmaker."
echo "Expect in the schedule: 3 events, earliest first. The 2020 row must NOT"
echo "                        appear, it tests that past dates are dropped."
