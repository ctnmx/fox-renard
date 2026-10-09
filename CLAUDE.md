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

## Parallel sessions

Several sessions may build tickets at once, each on its own branch. **Hot files** are the ones most tickets touch: `README.md`, `CLAUDE.md`, `docs/agents/`, `package.json`, `pnpm-lock.yaml`, `.github/workflows/`, database migrations, and ADR numbers.

- Before opening a pull request, and again before calling it done, merge `origin/main` into the branch and re-run the checks CI runs.
- After that merge, regenerate rather than hand-merge: `pnpm install` for the lockfile; delete this branch's migration and rerun the db `generate` script; renumber a new ADR past the highest one on `main`.
- `/retro` writes hot files: merge `origin/main` first and keep its changes in one separate commit. If another open pull request edits the same file, tell the user so they choose which lands first.
- `/to-tickets`: when two tickets edit the same hot file (the lockfile aside), give one a blocking edge on the other.
