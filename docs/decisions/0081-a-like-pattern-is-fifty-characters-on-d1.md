# 0081: A LIKE or GLOB pattern is fifty characters on D1, and `check:migrations` measures every one

- Status: Proposed
- Date: 2026-09-16

## Context

`POST /api/admin/bar/categories` returned an unhandled 500 for every category given a colour,
with `D1DatabaseSessionAlwaysPrimary._sendOrThrow` at the foot of the stack and `auditedWrite`
above it. Nothing in the trace named a constraint, a column or a statement, so the batch, the
drizzle patch of 0067 and the schema drift between the repository and the live database were all
suspected first, and all three were wrong.

The cause is one line of migration 0053. `bar_categories.colour` carried
`CHECK(colour IS NULL OR colour GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]')`,
a 67-character pattern. Cloudflare builds SQLite with `SQLITE_MAX_LIKE_PATTERN_LENGTH` at 50,
against the stock 50000, and a pattern over it raises `SQLITE_ERROR: LIKE or GLOB pattern too
complex`. Measured against a real D1 under `wrangler dev --local`: 50 characters passes, 51
fails. It is not a count of character classes; the date patterns this schema already relies on
are eight classes and 42 characters, and they pass.

Two properties of the limit are what made this expensive to find. It is checked when the pattern
is **evaluated**, not when the statement is prepared, so the migration applied cleanly, the
schema in production matched the repository exactly, and `EXPLAIN` of the failing statement ran.
And because the constraint short-circuits on `colour IS NULL`, every category without a colour
saved perfectly; only a colour reached the pattern at all. The route looked half-broken rather
than wrong.

Nothing local can find this. Every unit and integration suite runs on a SQLite driver built with
the stock limit, where the pattern is valid, and `nuxt dev` does the same. This is the second
D1-only failure class after 0067, and it has the same shape: correct SQL against a runtime nobody
tests on.

## Decision

**The limit is 50 characters, and it is enforced statically.** `likePatternProblems` in
`shared/utils/migrations.ts` reads every `LIKE` and `GLOB` pattern literal out of a file and
refuses one over `MAX_LIKE_PATTERN`. `check:migrations` runs it over `server/db/schema/**` and
over every migration in `server/db/migrations/sqlite`, so a pattern is refused where a person
writes it as well as where it lands. 0053 is named in `GRANDFATHERED_PATTERNS`: applied history
cannot change, and 0111 replaces what it created.

**The colour constraint keeps its meaning and loses its length.** It becomes
`colour IS NULL OR lower(colour) GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'`, 49
characters. Case-insensitivity moves from the character class to `lower()`, so the constraint
still accepts exactly what `hexColour` in `shared/utils/bar.ts` accepts, in either case, and the
two cannot disagree. 49 leaves one character of headroom, which is only safe because the check
above now measures it.

**Migration 0111 rebuilds `bar_categories` without holding its dependents**, and is named in
`HAND_REVIEWED_REBUILDS` on that basis rather than on 0063's. A `CHECK` cannot be altered in
SQLite, so changing one is a rebuild, and `bar_categories` has five tables in its closure:
`bar_products` (restrict), through it `product_variants`, `variant_components` and
`variant_prices`, and `category_prices` (cascade). 0063's procedure would drop and recreate all
five around it. Two of them, `variant_prices` and `category_prices`, are append-only price
registers, and 0010 refuses a migration that rebuilds one; 0063 does not resolve that collision
because none of its own cases met it.

It is not resolved here either. The migration is instead placed **before the bar catalogue
carries a row**, where the restrict dependent cannot abort the drop and the cascade dependent has
nothing to lose, and the six-table dance is not needed at all. This is a decision about when the
migration runs, and it is the whole of its safety: applied to a populated catalogue it would
abort on `bar_products` or silently empty `category_prices`. Its entry in
`HAND_REVIEWED_REBUILDS` says so, and cites this record rather than 0063, because the sentence
0063 requires there ("the ordering was verified against a real fixture") would not be true.

## Consequences

- A third `HAND_REVIEWED_REBUILDS` justification now exists alongside 0063's, and it is narrower
  and more perishable: it holds only while the table is empty. A later migration wanting the same
  waiver on the same grounds needs the same emptiness to still be true, and the person writing it
  has to say so. If the bar catalogue is live before 0111 applies, 0111 is wrong and the answer
  is 0063's procedure plus an amendment to 0010, not a retry.
- The static check is a lower bound on the problem, not a solution to it. It reads pattern
  literals; a pattern assembled at runtime, or bound as a parameter, passes it untouched. Nothing
  in this repository does either today, and the check says nothing about the day something does.
- `docs/known-issues.md` already carries the gap 0067 named: no automated suite exercises the D1
  driver. This is the second defect that gap let through, and the second reproduction recipe
  written by hand. The recipe is the same one: build, `wrangler dev --local`, apply the
  migrations to the local D1, drive the statement.
- British-English spelling reaches the schema too: `colour` is the column, and the pattern is
  written once in `server/db/schema/bar.ts` and generated from there.

## Options considered

**Lowercase the colour in `hexColour` and drop `lower()` from the constraint.** Rejected as the
same length with an extra moving part. The pattern would be 43 characters rather than 49, but the
constraint and the form would then agree only because two separate pieces of code were kept in
step by hand; today the constraint accepts what the form accepts because it is written to.

**Express the test with `length`, `substr` and `trim` and use no pattern at all.**
`length(c) = 7 AND substr(c, 1, 1) = '#' AND trim(lower(substr(c, 2)), '0123456789abcdef') = ''`
works on D1 and has no limit to hit. Rejected for readability: it is three clauses and a trim
against a character bag to say what one GLOB says plainly, and this schema already spells four
other shape constraints as GLOBs. The check that measures patterns is what makes the plain
spelling safe to keep.

**Move `colour` to its own table so no rebuild is needed.** An additive table cannot remove the
broken `CHECK` from `bar_categories.colour`, and SQLite refuses `DROP COLUMN` on a column a
`CHECK` constraint references, so the broken constraint and a dead column would both stay. It
trades a rebuild for permanent drift and a join on every category read.

**Wait for the estate reset and change 0053 in place.** Applied migrations are immutable whether
or not a database currently exists to have applied them; nothing else in this repository has ever
edited one, and a reset is not a licence to start.
