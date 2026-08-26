# The unified NNT system

Conventions and invariants for this repository. `CONTRIBUTING.md` carries the full engineering
standards; this file is the short list an assistant or a newcomer must never violate. A human
(usually the NNT IT Manager) reviews everything. The committee turns over yearly, so write
code and documentation a successor can pick up cold.

## The order of work

1. **The Phase 0 gate passed on 26 August 2026** (0019), so product code belongs here. The
   configuration defaults are provisional until the workshops confirm them: every operational
   number ships as its proposed value in `docs/workshops.md`, and a key with no proposed value
   ships unset rather than guessed.
2. **Spec, then failing tests, then implementation.** Every change traces to a backlog story
   (`docs/backlog/`) or a decision record (`docs/decisions/`). Failing unit and integration
   tests reflecting the spec land first; the implementation follows; the tests pass.
3. **Documentation moves in the same pull request as the behaviour.** Drift is a defect.

## Invariants (each is a decision record; cite it, do not re-argue it)

- One application, one D1 database. Atomicity is `db.batch` only; contended claims are
  conditional writes with the predicate on the statement; ids scope by subquery, never an
  `IN` list from a result set; bound parameters chunk at 90 (0001, 0003, 0006).
- Money is integer pence in the append-only ledger; every money-taking screen sends its
  expected total and a mismatch refuses quoting both figures (0004, 0005).
- **Payment only via the SU's physical SumUp reader.** No online charge, no card data, ever.
  This is an SU rule, not a preference (0005).
- Append-only tables (ledger, stock, incidents, age checks, prices, records, audit) are
  trigger-enforced; corrections supersede. A migration that rebuilds one is refused (0010).
- Erasure is anonymisation in one transaction; no personal free text in audit detail (0011).
- Roles expire at the committee year end (31 July, London). Operational authority derives from
  facts (tonight's confirmed shift, a current training record), never from a standing grant
  (0009).
- Google sign-in is Workspace-only; no password may ever exist on an `@newtheatre.org.uk`
  address, including via import (0008).
- Every domain date is Europe/London; the show night runs 04:00 to 04:00 (0014).
- Policy numbers are configuration enforced at the write path and quoted live on content
  pages via placeholder tokens; an unknown token fails CI (0012).
- Everything record-like keys to a performance, never to a day or a venue.
- The live schema carries no legacy-id columns (0015).

## Comments

Enforced by CI, no exemptions: two lines maximum; a comment carries what the code cannot (a
constraint, a trap, a contract); no JSDoc block tags; no narrated history; no figures a
comment cannot keep true. Anything longer becomes a decision record or documentation, cited
from a one-line comment.

## Writing style

No em dashes anywhere: use a comma, colon, semicolon, parentheses or two sentences. British
English in UI copy and documentation. No references to any AI assistant or tool in code,
comments, commits, pull requests or documentation; work is attributed to the person who
submitted it, with no generated-with or co-author trailers.

## Secrets

Never in code, config defaults, fixtures, tests or documentation. Per-worker secrets are
worker secrets; shared secrets live in the Cloudflare account Secrets Store; everything is
mirrored in the committee password manager. Seed scripts generate random credentials at
runtime, print them once, and refuse to run against production.
