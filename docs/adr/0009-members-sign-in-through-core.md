# Members sign in through Core, not Better Auth

The V1 spec named Better Auth for the Members' magic links. Core signs Members in itself instead, the way it already verifies Commenters: a sign-in link carries a random token, works once and for an hour, and opens a console session. The session is another random token, kept in a `__Host-` cookie that is HttpOnly, Secure and SameSite=Strict, and stored only as its SHA-256, so a copy of the database signs nobody in. Each session lasts 30 days, until its Member signs out.

Better Auth would have kept its own users, sessions and verification tokens beside our Members table, and read its own clock. Seam 1 drives expiry through Core's controllable clock, which Better Auth's links and sessions would escape. Its session cookie is also signed with a secret, a secret the Worker would need. The sign-in rules, a few dozen lines, stay in Core with the others, behind the same ports (ADR-0003).

## Considered Options

- **Better Auth with its magic link plugin**: the spec's choice, with OAuth and passkeys within reach, but it brings tables and a clock of its own and a signing secret, for one Member per Organization in V1.
- **A signed, stateless session cookie**: no session table, but no way to end a session before it expires, and a secret to rotate.

## Consequences

Signing in another way, such as with a passkey or a Google account, means building it in Core or revisiting this decision.
