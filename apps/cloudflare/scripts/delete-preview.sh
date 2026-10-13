#!/usr/bin/env bash
# Deletes what a pull request's preview holds: the Cloudflare preview, its
# Hyperdrive config and its Neon branch. What is already gone stays gone.
#   PREVIEW=pr-<number> bash scripts/delete-preview.sh
# Needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NEON_API_KEY and
# NEON_PROJECT_ID, the preview project.
set -euo pipefail
cd "$(dirname "$0")/.."

# A pull request closed before its first preview has none. A preview left
# behind costs nothing: Cloudflare drops the oldest past 100.
pnpm exec wrangler preview delete --name "$PREVIEW" --skip-confirmation ||
  echo "::warning::Cloudflare deleted no preview named $PREVIEW."

node scripts/hyperdrive.mjs delete "fox-renard-$PREVIEW"

# https://api-docs.neon.tech/reference/listprojectbranches
branches="https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches"
neon() { curl --fail --silent --show-error --header "Authorization: Bearer $NEON_API_KEY" "$@"; }
id="$(neon "$branches?search=$PREVIEW" | jq -r --arg name "$PREVIEW" '.branches[] | select(.name == $name) | .id')"
if [ -z "$id" ]; then
  echo "No Neon branch is named $PREVIEW."
else
  neon --output /dev/null --request DELETE "$branches/$id"
  echo "Deleted the Neon branch $PREVIEW."
fi
