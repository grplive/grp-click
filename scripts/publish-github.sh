#!/bin/bash
# Publishes the current version as a GitHub Release on grplive/grp-click (public downloads).
# This repo holds the source, so main must be committed and pushed first; the README on main is
# the download page. Builds are unsigned (same as the NAS); the README explains the one-time steps.
# Assets use fixed names so ".../releases/latest/download/<name>" links never change, and the
# app's "Update available" check finds the new version.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="grplive/grp-click"
VER=$(node -p "require('./app/package.json').version")
MODVER=$(node -p "require('./companion-module/package.json').version")
fail() { echo "STOP: $*" >&2; exit 1; }

for f in "app/dist/GRP-Click-$VER-mac-arm64.dmg" "app/dist/GRP-Click-$VER-mac-x64.dmg" "app/dist/GRP-Click-Setup-$VER.exe" "companion-module/grplive-click-$MODVER.tgz"; do
  [[ -f "$f" ]] || fail "missing $f - run scripts/release.sh --build first"
done
NOTES="scripts/release-notes/$VER.md"
[[ -f "$NOTES" ]] || fail "write release notes first: $NOTES"
[[ -z "$(git status --porcelain)" ]] || fail "commit your changes first"
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "push main first (git push origin main)"
gh release view "v$VER" --repo "$REPO" >/dev/null 2>&1 && fail "v$VER is already published"

T=$(mktemp -d)
cp "app/dist/GRP-Click-$VER-mac-arm64.dmg" "$T/GRP-Click-Mac-Apple-Silicon.dmg"
cp "app/dist/GRP-Click-$VER-mac-x64.dmg" "$T/GRP-Click-Mac-Intel.dmg"
cp "app/dist/GRP-Click-Setup-$VER.exe" "$T/GRP-Click-Windows-Setup.exe"
cp "companion-module/grplive-click-$MODVER.tgz" "$T/GRP-Click-Companion-Module.tgz"
gh release create "v$VER" --repo "$REPO" --target main --title "GRP Click $VER" --notes-file "$NOTES" --latest "$T"/*
rm -rf "$T"
echo "Published: https://github.com/$REPO/releases/tag/v$VER"
