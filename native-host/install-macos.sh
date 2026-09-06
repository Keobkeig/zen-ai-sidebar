#!/bin/sh
# Install the Local Whisper native host for Zen/Firefox. Pass a Chrome extension
# ID as the first argument to install the Chrome host manifest too.
set -eu

HOST_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VENV_DIRECTORY="$HOST_DIRECTORY/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

"$PYTHON_BIN" -m venv "$VENV_DIRECTORY"
"$VENV_DIRECTORY/bin/python" -m pip install --upgrade pip
"$VENV_DIRECTORY/bin/python" -m pip install -r "$HOST_DIRECTORY/requirements.txt"
chmod +x "$HOST_DIRECTORY/run-host.sh" "$HOST_DIRECTORY/zen_ai_whisper.py"

install_manifest() {
  template="$1"
  destination="$2"
  chrome_id="${3:-}"
  mkdir -p "$(dirname -- "$destination")"
  "$VENV_DIRECTORY/bin/python" - "$template" "$destination" "$HOST_DIRECTORY/run-host.sh" "$chrome_id" <<'PY'
import json
import pathlib
import sys

template, destination, host_path, chrome_id = sys.argv[1:]
manifest = json.loads(pathlib.Path(template).read_text())
manifest["path"] = host_path
if chrome_id:
    manifest["allowed_origins"] = [f"chrome-extension://{chrome_id}/"]
pathlib.Path(destination).write_text(json.dumps(manifest, indent=2) + "\n")
PY
}

FIREFOX_MANIFEST="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/com.zen_ai_sidebar.whisper.json"
install_manifest "$HOST_DIRECTORY/com.zen_ai_sidebar.whisper.json.template" "$FIREFOX_MANIFEST"
printf 'Installed Firefox/Zen Local Whisper host.\n'

if [ "${1:-}" != "" ]; then
  CHROME_MANIFEST="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.zen_ai_sidebar.whisper.json"
  install_manifest "$HOST_DIRECTORY/com.zen_ai_sidebar.whisper.chrome.json.template" "$CHROME_MANIFEST" "$1"
  printf 'Installed Chrome Local Whisper host for extension ID %s.\n' "$1"
else
  printf 'To enable Chrome, rerun: %s <your Chrome extension ID>\n' "$0"
fi
