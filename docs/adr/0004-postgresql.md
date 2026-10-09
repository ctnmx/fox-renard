# PostgreSQL as the only database

We use PostgreSQL (Neon through Hyperdrive during the Cloudflare phase) rather than Cloudflare D1 or SQLite. It gives row-level isolation between Organizations, full-text search, and a database that stays put when the compute moves between platforms; self-hosters already know how to run it. We accept running an extra service and depending on an external provider during the Cloudflare phase.

## Considered Options

- **Cloudflare D1**: free and native to Workers, but ties the data to Cloudflare and caps each database at 10 GB.
- **SQLite / Bunny Database**: a single portable file, but weaker isolation between Organizations and no shared database once several servers run.
