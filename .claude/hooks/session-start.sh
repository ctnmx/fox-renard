#!/bin/bash
# Installs the workspace's dependencies so typecheck, Biome and both test seams
# run from the first turn of a cloud session. Playwright's Chromium is already
# installed in /opt/pw-browsers.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
pnpm install --frozen-lockfile
