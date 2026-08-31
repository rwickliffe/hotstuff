#!/bin/bash
# Produce a single self-contained HTML file with images embedded as data: URIs.
# ponytail: string substitution, not a build tool. Swap for real <img src> + CDN if this ever ships for real.
set -euo pipefail
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
echo "wrote $out ($(du -h "$out" | cut -f1))"
