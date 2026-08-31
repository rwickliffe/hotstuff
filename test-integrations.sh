#!/bin/bash
# Regenerates a copy of the site pointed at local stand-ins for both sheets,
# to prove the live-data paths still work after edits.
#
#   catalog  -> data/live-products.csv  replaces the product list
#   schedule -> data/live-events.csv    replaces the sample dates
#
# Substitutes whatever the constants currently hold, so this keeps working
# once the real published URLs are filled in.
set -euo pipefail

sed -E \
  -e 's|var PRODUCTS_CSV_URL = "[^"]*";|var PRODUCTS_CSV_URL = "/data/live-products.csv";|' \
  -e 's|var EVENTS_CSV_URL = "[^"]*";|var EVENTS_CSV_URL = "/data/live-events.csv";|' \
  index.html > integration-test.html

grep -q '"/data/live-products.csv"' integration-test.html || { echo "FAIL: catalog URL not substituted";  exit 1; }
grep -q '"/data/live-events.csv"' integration-test.html || { echo "FAIL: schedule URL not substituted"; exit 1; }

echo "OK. Serve the folder and open: http://localhost:8765/integration-test.html"
echo
echo "Expect in the catalog:  Brand New Peach Salsa, Chow Chow (All gone), Widowmaker."
echo "Expect in the schedule: 3 events, earliest first. The 2020 row must NOT"
echo "                        appear, it tests that past dates are dropped."
