# Previews never hold production data

Each pull request's preview gets its own Neon branch, cut from a second Neon project that holds only the seed. No preview branches from the production database. A branch of production would copy every Commenter's email and every Comment into a public preview URL, running code nobody has reviewed yet. CI migrates and seeds each preview branch itself, so a preview shows Recto Verso's Site with no Comment, Reaction or Visitor of its own. The two projects also keep previews from spending production's branches and compute-hours on Neon's free plan.

## Considered Options

- **Branch each preview from production**: Neon's usual workflow, with real data to test against, but it puts personal data on public preview URLs and shares production's 10 branches and 100 compute-hours a month.
- **Schema-only branches of production**: they copy no rows, but each one is a root branch, and the free plan allows 3 root branches per project.
