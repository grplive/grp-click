#!/bin/bash
# Builds the NAS download folder from the receiver installers and the packaged Companion module.
#   scripts/release.sh            uses what's already built
#   scripts/release.sh --build    runs the tests and rebuilds everything first
# Output: release/GRP Click/  -> copy that whole folder to the NAS (replace the old one).
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('./receiver/package.json').version")
MODVER=$(node -p "require('./companion-module/package.json').version")
if [[ "${1:-}" == "--build" ]]; then
  (cd receiver && npm test && npm run build)
  (cd companion-module && rm -rf pkg ./*.tgz && npm run package)
fi
OUT="release/GRP Click"
mkdir -p "$OUT"
# Anything from an older version moves to Previous versions/<old version>/
for d in "Mac - Apple Silicon" "Mac - Intel" "Windows" "Companion module"; do
  mkdir -p "$OUT/$d"
  for f in "$OUT/$d"/*; do
    [[ -e "$f" ]] || continue
    [[ "$f" == *.txt ]] && continue
    old=$(basename "$f" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [[ "$d" == "Companion module" ]]; then [[ "$old" == "$MODVER" ]] && continue; else [[ "$old" == "$VER" ]] && continue; fi
    mkdir -p "$OUT/Previous versions/$old"
    mv "$f" "$OUT/Previous versions/$old/"
  done
done
cp "receiver/dist/GRP-Click-Receiver-Mac-Apple-Silicon.pkg" "$OUT/Mac - Apple Silicon/GRP-Click-Receiver-$VER-Mac-Apple-Silicon.pkg"
cp "receiver/dist/GRP-Click-Receiver-Mac-Intel.pkg" "$OUT/Mac - Intel/GRP-Click-Receiver-$VER-Mac-Intel.pkg"
cp "receiver/dist/GRP-Click-Receiver-Windows.zip" "$OUT/Windows/GRP-Click-Receiver-$VER-Windows.zip"
cp "companion-module/grplive-click-$MODVER.tgz" "$OUT/Companion module/"
cp scripts/release-docs/*.txt "$OUT/"
cp scripts/release-docs/companion/*.txt "$OUT/Companion module/"
sed -i '' "s/{{VER}}/$VER/g; s/{{MODVER}}/$MODVER/g; s/{{DATE}}/$(date '+%-d %B %Y')/g" "$OUT"/*.txt "$OUT/Companion module"/*.txt
echo "Built: $OUT  (receiver $VER, Companion module $MODVER)"
find "$OUT" -type f | sed "s#^$OUT/#  #" | sort
