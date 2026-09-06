#!/bin/sh
set -eu

HOST_DIRECTORY=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$HOST_DIRECTORY/.venv/bin/python" "$HOST_DIRECTORY/zen_ai_whisper.py"
