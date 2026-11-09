#!/usr/bin/env bash
# Build the local Orca and install it to /Applications. Usage: ./update-local.sh [--pull]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="/Applications/Orca.app"
BUILT_APP="$REPO_DIR/dist/mac-arm64/Orca.app"
INSTALL_LOG="$HOME/Library/Logs/orca-update-local.log"
DATA_DIR="$HOME/Library/Application Support/orca"
# ponytail: keeps only the latest pre-update snapshot; add dated copies if one isn't enough
BACKUP_DIR="$HOME/orca-backup"

cd "$REPO_DIR"
source "$HOME/.nvm/nvm.sh"
nvm use 24 >/dev/null

if [[ "${1:-}" == "--pull" ]]; then
  git pull --rebase --autostash
fi

pnpm install
pnpm -C mobile install --frozen-lockfile
pnpm build:unpack
# Without a Developer ID, electron-builder leaves the main binary signed as "Electron", so macOS drops its notifications.
# Ad-hoc sign Electron's bundles, then the app; Helpers/ is already signed by afterPack.
for bundle in "$BUILT_APP"/Contents/Frameworks/*.framework "$BUILT_APP"/Contents/Frameworks/*.app "$BUILT_APP"; do
  codesign --force --sign - "$bundle"
done
codesign --verify --deep --strict "$BUILT_APP"

# Detached: quitting Orca may kill this shell when it runs inside an Orca terminal.
nohup bash -c '
  set -e
  osascript -e "quit app \"Orca\"" || true
  # CLI/MCP children also run the Orca binary, so ask for the app, not the process name.
  while [ "$(osascript -e "application \"Orca\" is running")" = "true" ]; do sleep 1; done
  rsync -a --no-specials --no-devices --delete "'"$DATA_DIR"'/" "'"$BACKUP_DIR"'/"
  rm -rf "'"$APP_PATH"'.new"
  cp -R "'"$BUILT_APP"'" "'"$APP_PATH"'.new"
  rm -rf "'"$APP_PATH"'"
  mv "'"$APP_PATH"'.new" "'"$APP_PATH"'"
  open "'"$APP_PATH"'"
  echo "$(date) installed $(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "'"$APP_PATH"'/Contents/Info.plist")"
' >>"$INSTALL_LOG" 2>&1 &

echo "Build done. Orca will quit, back up data to $BACKUP_DIR, update and reopen (log: $INSTALL_LOG)."
