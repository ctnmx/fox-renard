# Fox Renard

Open-source, privacy-first Comments and Reactions for websites: an alternative to Hyvor Talk.

- Visitors react with one tap and vote on Comments without giving any identity.
- Commenters post under a display name and can verify their email by magic link.
- Members moderate their Sites from a small console.
- Fox Renard stores no IP address, carries no tracker or ad, and shares no identity across Sites.

**Status:** in development. V1 is built first for [Recto Verso](https://rectoverso.co); see the [V1 spec](https://github.com/ctnmx/fox-renard/issues/1).

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

[CONTRIBUTING.md](CONTRIBUTING.md#run-the-tests-locally) lists the checks CI runs and how to run both test seams.

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

## License

Fox Renard is free software, licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). If you modify it and let people use it over a network, you must offer them the source code of your version.

Outside contributors sign a [Contributor License Agreement](CLA.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. The project's vocabulary is in [GLOSSARY.md](GLOSSARY.md), and its decisions are in [docs/adr/](docs/adr/).
