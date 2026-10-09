# Platform-independent core behind adapters

The domain logic is plain TypeScript with no dependency on Cloudflare. The HTTP layer (Hono), database access and file storage (S3-compatible) sit behind adapters, so moving from Cloudflare to Bunny.net, Node or a self-hosted server is a deployment change, not a rewrite. We accept not using Cloudflare-only primitives (KV, Durable Objects, D1, Queues) in the core.
