# Fox Renard

Open-source, privacy-first comments & reactions platform (Hyvor Talk alternative).
First customer: rectoverso.co (Webflow), migrating from Hyvor Talk.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on `ctnmx/fox-renard`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Code

- Seam 1 tests (`packages/api/test`) start the HTTP API in-process with `startTestApi()`; Seam 2 tests (`apps/demo/tests`) drive the demo route sheet in Chromium, and `pnpm --filter @fox-renard/demo screenshot <file.png>` captures the Widget there.
- Schema changes go in `packages/db/src/schema.ts`; `pnpm --filter @fox-renard/db generate` then writes the migration.
- `@playwright/test` stays on the version whose Chromium the cloud container pre-installs in `/opt/pw-browsers`.
