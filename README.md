# The unified Nottingham New Theatre system

One application replacing the four-app estate (stage-door, proscenium, rooms, rehearsal): one
account, one calendar, one ledger and one show-night toolkit for the country's only entirely
student-run theatre. This branch starts from an empty history on purpose; the definition came
first, and the first product commit lands only after the Phase 0 gate.

## Where things stand

- **Phase 0 (definition) is delivered and the gate passed on 26 August 2026.** The full package
  is in [`docs/`](docs/README.md): a 260-story backlog, 19 accepted decision records, the
  roadmap, the configuration workshops register and the spike outcomes.
- **The gate:** the committee signed the backlog scope and the decision records; the
  configuration defaults are deferred to the workshops in the week of 31 August and ship
  meanwhile as their proposed values. Recorded in
  [`docs/decisions/0019-phase-0-gate-passed-with-provisional-configuration.md`](docs/decisions/0019-phase-0-gate-passed-with-provisional-configuration.md).
- **Phase 1 (foundations) is in progress:** the application scaffold, the CI gates and the
  configuration surface.
- **The destination:** cutover from the old estate by 31 October 2026, hardening through
  December, V2 from January 2027.

## The one-paragraph architecture

Nuxt 4 on Cloudflare Workers with D1, one database for everything (decisions 0001 to 0003).
Money is integer pence in an append-only ledger, and payment happens only in person on the
SU's SumUp reader (0004, 0005). Capacity, shifts and register marks are held by conditional
writes and unique indexes, proven by racing tests (0006, 0016). Roles expire at the committee
year and operational authority derives from facts: a rostered shift tonight, a current
training record (0009). Policy numbers live in configuration, enforced at the write path and
quoted live on the public policy pages (0012). Everything the theatre could be held to
account for (incidents, age checks, prices, stock, audit) is append-only (0010). Erasure is
one transaction (0011). Every date is Europe/London and the show night runs 04:00 to 04:00
(0014).

## How to work here

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md); the order is spec, then failing tests, then
   implementation.
2. Pick a story from [`docs/backlog/`](docs/backlog/README.md); each carries testable
   acceptance criteria, a phase and its dependencies.
3. Decisions live in [`docs/decisions/`](docs/decisions/README.md); accepted records are
   superseded, never edited.
4. The committee turns over yearly. Write everything for the person who arrives next September
   with no context and nobody to ask.

## The old estate

The four existing applications keep running until their modules cut over (schedule in
[`docs/roadmap.md`](docs/roadmap.md)). Their code lives on this repository's `main` and in the
sibling repositories; after cutover the old estate goes read-only and stays available as the
historical archive. The audit of the old estate and the full specification are held by the IT
Manager alongside this package.
