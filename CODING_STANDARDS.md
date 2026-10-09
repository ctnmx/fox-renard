# Coding standards

The judgement calls a review checks. Tooling enforces the mechanical rules: TypeScript strict, Biome (including the guard on Core's imports), the Widget size budget and the migrations check in CI.

## Domain rules live in Core

Core (`packages/core`) holds every rule a Visitor or Member would state: which domains may load the Widget, when a Page is created, how long a Page title may be (ADR-0003). Adapters translate between the outside world and Core. The HTTP API validates the shape of a request (types, formats, size limits against abuse) and maps Core's outcomes to status codes; that validation is the adapter's job, not a domain rule.

## Tests observe, like a Visitor or Member

Tests drive Fox Renard at Seam 1 (`startTestApi()`) or Seam 2 (the demo route sheet in Chromium) and assert on what a Visitor or Member observes: HTTP responses, what a later request returns, emails in the outbox, Photos in the store, the rendered Widget and the requests the browser makes. Database rows and internal calls stay out of assertions.

## Vocabulary

Code, comments, test names and docs use the terms of `GLOSSARY.md`, and a change to what a term means is flagged as `docs/agents/domain.md` describes.
