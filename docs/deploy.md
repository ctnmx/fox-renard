# Deploy

Fox Renard runs on Cloudflare under foxrenard.com. One Worker (`apps/cloudflare`) serves the HTTP API and the Widget script. PostgreSQL runs on Neon in Frankfurt, and the Worker reaches it through Hyperdrive. Brevo sends the emails.

## Where Fox Renard answers

| Host | Serves |
| --- | --- |
| `embed.foxrenard.com` | The Widget script and the HTTP API. The Widget calls the API on its script's own origin, so they share it. |
| `console.foxrenard.com` | The Member console, once #14 lands. |
| `mail.foxrenard.com` | The sender domain Brevo authenticates. Every email comes from `noreply@mail.foxrenard.com`. |
| `pr-<number>-fox-renard.<subdomain>.workers.dev` | The preview of a pull request. |
| `foxrenard.com` | Free for a landing page. |

A Site embeds the Widget with `<script async src="https://embed.foxrenard.com/widget.js"></script>`.

## What deploys when

CI (`.github/workflows/ci.yml`) deploys once the `check` job passes:

- **Merging to `main`** deploys production. CI migrates the production database, runs the seed, points Hyperdrive at the database, deploys the Worker with its secrets, then runs the smoke check against `embed.foxrenard.com`.
- **Each pull request** gets a preview: a Neon branch `pr-<number>` of the preview project, migrated and seeded, its own Hyperdrive config, and a Cloudflare preview of the Worker. The smoke check runs against it, and the pull request links it as a `preview` deployment.
- **Closing a pull request** deletes its preview, its Hyperdrive config and its Neon branch (`apps/cloudflare/scripts/delete-preview.sh`). A preview job that finds its pull request closed when it ends deletes them too.

Some rules hold for every deployment:

- **Migrations run before the Worker deploys.** A migration must therefore keep the Worker version already running working.
- **The seed is idempotent.** It creates Recto Verso's Organization, Member, Site, Allowed Domains and Reaction Set once, and changes nothing afterward.
- **Previews never hold production data** (ADR-0008). Their branches belong to a second Neon project, and their seed uses the demo Member `membre@example.com`.
- **The smoke check** serves the demo route sheet on `localhost` and loads it against the deployment. It sees the Reaction Set, as Seam 3's `@smoke` test does locally. It adds one Page, `article-smoke-check`, to Recto Verso's Site, which is why `localhost` is one of its Allowed Domains.
- **Previews run no Cron Trigger.** Cloudflare runs the hourly erasure on production only.
  _Contradicts ADR-0006 on previews, but worth accepting:_ a preview erases expired fingerprints only when someone reacts or votes there, and keeps expired magic links, with their emails, until its pull request closes. Previews hold only the data of people testing them, and Cloudflare runs no Cron Trigger on a preview.

## Set it up

Nothing deploys until a human runs the wizard:

```sh
bash scripts/setup-deploy.sh
```

It walks through:

- the Cloudflare account, the foxrenard.com zone and an API token;
- the two Neon projects;
- the Brevo account, its API key and the sender domain;
- the GitHub secrets and variables below.

Its last stage sets `CLOUDFLARE_ACCOUNT_ID`, which turns the deploy jobs on, and can deploy `main` right away.

| GitHub | Name | Holds |
| --- | --- | --- |
| variable | `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account. Deploy jobs skip while it is unset. |
| secret | `CLOUDFLARE_API_TOKEN` | Edits Workers, Hyperdrive and foxrenard.com's DNS. |
| secret | `DATABASE_URL` | Production's direct connection string on Neon. |
| secret | `SEED_MEMBER_EMAIL` | Recto Verso's Member in production. |
| variable | `NEON_PREVIEW_PROJECT_ID` | The Neon project previews branch from. |
| secret | `NEON_API_KEY` | Creates and deletes preview branches, in the preview project only. |
| secret | `FINGERPRINT_SECRET` | The secret production derives each day's fingerprint key from (ADR-0006). |
| secret | `PREVIEW_FINGERPRINT_SECRET` | The same, for previews. |
| secret | `ALTCHA_HMAC_KEY` | Signs production's bot check challenges. |
| secret | `PREVIEW_ALTCHA_HMAC_KEY` | The same, for previews. |
| secret | `BREVO_API_KEY` | Sends the emails, from production and previews alike. |

Pull requests from forks get no secrets, so they get no preview.

## Wire a new platform piece

A ticket that needs a secret, a binding or a schedule wires it here (see CLAUDE.md):

- **A secret**:
  - add a stage to `scripts/setup-deploy.sh` that sets it as a GitHub secret, or add a secret nobody needs to see to its "Generated secrets" stage;
  - add it to both `jq -n` lines of `ci.yml`, production and preview;
  - declare it in `Env` in `apps/cloudflare/src/worker.ts`;
  - give Seam 3 a test value with `--var` in `apps/cloudflare/playwright.config.ts`.
- **A binding**, such as an R2 bucket:
  - add it to `apps/cloudflare/wrangler.jsonc` twice, at the top level and in `previews`, where it points at a resource for previews;
  - add any permission it needs to the API token stage. The token's template already edits R2.
- **A subdomain**: add a `custom_domain` route to `wrangler.jsonc`.

## Free-tier quotas to watch

Everything stays within free plans (ADR-0002). These are the limits Fox Renard can reach:

| Service | Limit | What reaches it |
| --- | --- | --- |
| Workers | 100,000 requests a day | Every API request. Requests for `widget.js` hit a static asset, which is free and unlimited. |
| Workers | 10 ms of CPU per request and per Cron Trigger | A request over it fails with error 1102. |
| Workers | 5 Cron Triggers per account | Fox Renard uses 1. |
| Workers | 100 previews per Worker | Past it, Cloudflare deletes the least recently deployed. |
| Hyperdrive | 100,000 queries a day | Each request runs several queries; past the limit, queries fail until 00:00 UTC. |
| Hyperdrive | 10 configs per account | Production plus one per open preview. |
| Neon | 10 branches per project | The preview project holds its root plus one per open preview. |
| Neon | 100 compute-hours a month per project | Production's 0.25 CU compute runs 400 hours a month at most. Each request and the hourly erasure wake it, and it suspends after 5 minutes idle. Hyperdrive may hold idle connections for up to 10 minutes, which can keep it awake longer. |
| Neon | 1 GB of storage per project, 5 GB of egress a month | Comments, Reactions and Votes. |
| Brevo | 300 emails a day | Magic links. Core caps an address at 3 working magic links per Site. Previews share this quota. |

Together, Hyperdrive's configs and the preview project's branches allow 9 open previews at once. A tenth preview fails to deploy until a pull request closes.

## Run the Worker locally

Seam 3 (`apps/cloudflare/tests`) runs the Worker in workerd under `wrangler dev`, on a PostgreSQL of your own. The URL needs a password, since Hyperdrive's local binding requires one:

```sh
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --filter @fox-renard/cloudflare e2e
```

It migrates and seeds that database first, and leaves what it creates there. Each run uses Pages and networks of its own, so runs don't interfere.
