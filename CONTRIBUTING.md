# Contributing to Fox Renard

Thank you for helping. This guide covers the Contributor License Agreement, how work flows from an idea to a merged pull request, the rules for `main`, the writing rules, what CI checks, and how to run the tests.

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

## Writing

These rules apply to code, tests, docs, issues and pull requests:

- Use the terms in `GLOSSARY.md`: a Visitor, not a "user"; a Page, not a "thread". The words each entry lists under _Avoid_ stay out of prose, identifiers and test names ([`docs/agents/domain.md`](docs/agents/domain.md)).
- Write in US English, in short sentences, in the active voice.

## What CI checks

GitHub Actions runs these on every pull request, and all of them must pass:

- TypeScript typechecking, in strict mode;
- Biome lint and formatting;
- Seam 1, the API tests;
- Seam 2, the browser tests;
- the build;
- the Widget size budget: 25 KB gzipped at most.

Each pull request also gets a preview deployment with its own database branch, removed when the pull request closes. CLA Assistant adds the `license/cla` check.

> **Status:** the walking skeleton ([#2](https://github.com/ctnmx/fox-renard/issues/2)) creates the commands and CI described here, and [#4](https://github.com/ctnmx/fox-renard/issues/4) adds preview deployments. Until they merge, the repository holds only documents.

## Run the tests locally

You need Node.js and pnpm. Install the dependencies once:

```sh
pnpm install
```

A good test drives Fox Renard the way a Visitor, Commenter or Member would. It asserts only on what they can observe: HTTP responses, what a later request returns, emails in the outbox, Photos in the store. It never asserts on internal calls or database rows.

### Seam 1: the HTTP API, in-process

```sh
pnpm test
```

Most tests live here. They call the HTTP API in-process against real PostgreSQL (PGlite, with the real migrations). Fake adapters stand in for the outside world: an in-memory email outbox, an in-memory Photo store, a controllable clock, a bot-check stub and a fixed fingerprint secret. You need no database server, network access or accounts.

### Seam 2: the Widget and the Counter in Chromium

```sh
pnpm exec playwright install chromium   # first run only
pnpm test:browser
```

Playwright drives the Widget and the Counter on a demo route sheet modelled on Recto Verso's, hostile CSS included.

To run a single test file at either seam, pass its path: `pnpm test <file>` or `pnpm test:browser <file>`.

### Before you push

Run what CI runs:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:browser
pnpm build
pnpm size   # the Widget size budget
```
