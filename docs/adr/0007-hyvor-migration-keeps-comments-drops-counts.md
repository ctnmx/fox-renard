# The Hyvor migration keeps Comments but drops counts

When Recto Verso moves from Hyvor Talk, we import Published and Pending Comments with their original dates, but no Reaction or Vote counts: the Hyvor export only holds totals, not who reacted or voted, so every Page restarts at zero. Commenters who used a HYVOR account arrive as Guests, because Hyvor does not share their email. Hyvor stays active for one month after the switch as a rollback, then its data is deleted.

## Considered Options

- **Import the totals as a starting count**: keeps the social proof, but lets earlier Visitors react or vote a second time and mixes two kinds of numbers in every count.
