#!/bin/bash
# Installs the workspace's dependencies so typecheck, Biome and the three test seams
# run from the first turn of a cloud session. Playwright's Chromium is already
# installed in /opt/pw-browsers.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
pnpm install --frozen-lockfile

# Seam 3 runs the Worker on PostgreSQL: start the server the image ships with.
# Hyperdrive's local binding wants a password in the URL, which trust ignores.
pg_bin="$(find /usr/lib/postgresql -maxdepth 2 -name bin -type d 2>/dev/null | sort -V | tail -n1)"
if [ -n "$pg_bin" ] && [ "$(id -u)" = 0 ]; then
  data=/var/lib/postgresql/seam3
  if ! pg_isready --quiet --host localhost --port 5432; then
    [ -d "$data" ] || runuser -u postgres -- "$pg_bin/initdb" --pgdata "$data" --username postgres --auth trust >/dev/null
    runuser -u postgres -- "$pg_bin/pg_ctl" --pgdata "$data" --log "$data.log" --options "-p 5432 -k /var/lib/postgresql" start >/dev/null
  fi
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres" >>"$CLAUDE_ENV_FILE"
  fi
fi
