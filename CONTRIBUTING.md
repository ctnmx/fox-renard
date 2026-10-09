# Contributing to Fox Renard

Thank you for helping. This guide covers the Contributor License Agreement, how work flows from an idea to a merged pull request, the rules for `main`, the standards, what CI checks, and how to run the tests.

Read [`GLOSSARY.md`](GLOSSARY.md) and the decisions in [`docs/adr/`](docs/adr/) first.

## Sign the CLA

Fox Renard is licensed under AGPL-3.0. Outside contributors sign the [Contributor License Agreement](CLA.md) before their first pull request is merged. You keep the copyright in your work. The CLA lets the maintainer also offer Fox Renard under a commercial license ([ADR-0001](docs/adr/0001-agpl-license-with-cla.md)).

- **When:** on your first pull request, the CLA Assistant bot comments with a link. You can also sign ahead of time at <https://cla-assistant.io/ctnmx/fox-renard>.
- **How:** sign in with your GitHub account and accept. Signing once covers all your future contributions. If the CLA text changes, the bot asks you to sign the new version.
- **Check:** the `license/cla` check stays pending, and blocks the merge, until every commit author in the pull request has signed, apart from those exempt below.
- **Commit as yourself:** the check matches each commit's author email to a GitHub account. Commit with an email linked to your account, or the check cannot tell who you are.
- **Exempt:** the maintainer, bots, and commits that Claude Code on the web authors as `claude`. If a tool commits for you under such an account, sign anyway: the maintainer merges only once the pull request's author has signed.

## How work flows

Work moves through four steps: **grill, spec, tickets, implement**. Each step has a Claude Code skill in [`.claude/skills/`](.claude/skills/). You can follow the same steps by hand.

1. **Grill.** A relentless interview settles every decision behind an idea, one round of questions at a time (`/grill-with-docs`). It adds new terms to `GLOSSARY.md`. It records a decision as an ADR in `docs/adr/` when the decision is hard to reverse, surprising without context, and the result of a real trade-off.
2. **Spec.** `/to-spec` writes the settled design up as a spec and publishes it as a GitHub issue. [Issue #1](https://github.com/ctnmx/fox-renard/issues/1) is the V1 spec.
3. **Tickets.** `/to-tickets` splits the spec into tickets. Each ticket is a thin vertical slice that works end to end, a sub-issue of its spec, linked to the tickets that block it. Its triage label says who can pick it up: `ready-for-agent` or `ready-for-human` (`/triage`).
4. **Implement.** Each ticket is built on its own branch (`/implement`): test-first at the test seams below (`/tdd`), then reviewed against the repository's standards and the ticket (`/code-review`). It reaches `main` through one pull request.

Have an idea or found a bug? Open an issue before writing a large change, so it can be grilled and specced first. To pick up existing work, choose an open ticket with no open blocker.

## Pull requests to `main`

- Every change reaches `main` through a pull request. Nobody pushes to `main` directly, force-pushes it or deletes it.
- One pull request implements one ticket, and its description says `Closes #<ticket>`.
- A pull request merges only when every CI check below passes, and, for outside contributors, the `license/cla` check too.
- The maintainer reviews and merges.
- Commit messages start with a [Conventional Commits](https://www.conventionalcommits.org/) type: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## Standards

Tooling enforces the mechanical rules: TypeScript strict mode, Biome, the Widget size budget and the migrations check. Reviews check the judgement calls in [`CODING_STANDARDS.md`](CODING_STANDARDS.md): domain rules live in Core, tests observe what a Visitor or Member observes, and code and docs use the glossary's terms in plain US English.

## What CI checks

GitHub Actions runs these on every pull request, and all of them must pass:

- the migrations match `packages/db/src/schema.ts`;
- TypeScript typechecking, in strict mode;
- Biome lint and formatting;
- the build;
- the Widget size budget: 25 KB gzipped at most;
- Seam 1, the HTTP API tests;
- Seam 2, the Widget in Chromium.

CLA Assistant adds the `license/cla` check. Preview deployments, each with its own database branch, arrive with [#4](https://github.com/ctnmx/fox-renard/issues/4).

## Run the tests locally

You need Node 22 and pnpm. Install the dependencies once:

```sh
pnpm install
```

### Seam 1: the HTTP API, in-process

```sh
pnpm test
```

Most tests live here, in `packages/api/test`. They call the HTTP API in-process against real PostgreSQL (PGlite, with the real migrations). Fake adapters stand in for the outside world: an in-memory email outbox, an in-memory Photo store, a controllable clock, a bot-check stub and a fixed fingerprint secret. You need no database server, network access or accounts.

To run one file: `pnpm --filter @fox-renard/api test <file>`.

### Seam 2: the Widget in Chromium

```sh
pnpm --filter @fox-renard/demo exec playwright install chromium   # first run only
pnpm e2e
```

Playwright builds the Widget, starts the demo route sheet, hostile CSS included, and drives the Widget there. The tests live in `apps/demo/tests`.

To run one file: `pnpm --filter @fox-renard/demo e2e <file>`.

### Before you push

Run what CI runs:

```sh
pnpm typecheck
pnpm lint      # pnpm format fixes what it can
pnpm build
pnpm size
pnpm test
pnpm e2e
```

If you changed `packages/db/src/schema.ts`, run `pnpm --filter @fox-renard/db generate` and commit the migration it writes.
