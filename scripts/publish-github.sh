#!/bin/bash
# Publishes the current version as a GitHub Release on grplive/grp-click (public downloads).
# This repo holds the source, so main must be committed and pushed first; the README on main is
# the download page. Builds are unsigned (same as the NAS); the README explains the one-time steps.
# Assets use fixed names so ".../releases/latest/download/<name>" links never change.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="grplive/grp-click"
VER=$(node -p "require('./receiver/package.json').version")
MODVER=$(node -p "require('./companion-module/package.json').version")
fail() { echo "STOP: $*" >&2; exit 1; }

for f in receiver/dist/GRP-Click-Receiver-Mac-Apple-Silicon.pkg receiver/dist/GRP-Click-Receiver-Mac-Intel.pkg receiver/dist/GRP-Click-Receiver-Windows.zip "companion-module/grplive-click-$MODVER.tgz"; do
  [[ -f "$f" ]] || fail "missing $f - run scripts/release.sh --build first"
done
NOTES="scripts/release-notes/$VER.md"
[[ -f "$NOTES" ]] || fail "write release notes first: $NOTES"
[[ -z "$(git status --porcelain)" ]] || fail "commit your changes first"
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "push main first (git push origin main)"
gh release view "v$VER" --repo "$REPO" >/dev/null 2>&1 && fail "v$VER is already published"

T=$(mktemp -d)
cp receiver/dist/GRP-Click-Receiver-Mac-Apple-Silicon.pkg "$T/"
cp receiver/dist/GRP-Click-Receiver-Mac-Intel.pkg "$T/"
cp receiver/dist/GRP-Click-Receiver-Windows.zip "$T/"
cp "companion-module/grplive-click-$MODVER.tgz" "$T/GRP-Click-Companion-Module.tgz"
gh release create "v$VER" --repo "$REPO" --target main --title "GRP Click $VER" --notes-file "$NOTES" --latest "$T"/*
rm -rf "$T"
echo "Published: https://github.com/$REPO/releases/tag/v$VER"
