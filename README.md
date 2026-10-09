# Fox Renard

Open-source, privacy-first comments and reactions for websites. Licensed under
[AGPL-3.0](LICENSE).

## Modules

| Module | Path | Role |
| --- | --- | --- |
| Core | `packages/core` | Every domain rule, in plain TypeScript behind ports. |
| Database | `packages/db` | PostgreSQL schema, migrations and seed (Drizzle). |
| HTTP API | `packages/api` | Public endpoints (Hono) and the typed client. |
| Widget | `packages/widget` | The `<fox-renard-widget>` custom element (Preact). |
| Demo | `apps/demo` | A local route sheet embedding the Widget. |

## Develop

Requires Node 22 and pnpm.

```sh
pnpm install
pnpm --filter @fox-renard/widget build
pnpm --filter @fox-renard/demo start   # route sheet on http://localhost:4173
```

`pnpm typecheck`, `pnpm lint`, `pnpm test` (HTTP API), `pnpm e2e` (Widget in
Chromium), `pnpm build` and `pnpm size` are what CI runs on every pull request.

## Install the Widget

```html
<fox-renard-widget site-id="…" page-key="article-{slug}"></fox-renard-widget>
<script async src="https://…/widget.js"></script>
```

The first load of an unknown Page Key from an Allowed Domain creates the Page.
An Allowed Domain matches exactly: `www.` is a domain of its own.

## Seed a database

```sh
cd packages/db
DATABASE_URL=postgres://… pnpm migrate
DATABASE_URL=postgres://… SEED_MEMBER_EMAIL=… pnpm seed
```

The seed creates Recto Verso's Organization, Member, Site and Reaction Set,
and changes nothing when run again.
