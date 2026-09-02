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

## Getting started

Bun 1.4 or later and Node 20 or later. No Cloudflare account is needed: the database runs as a
local SQLite file under `.data/`.

```bash
cp .env.example .env      # then set NUXT_SESSION_PASSWORD to any long random string
bun install
bun run dev               # http://localhost:3001
```

Before opening a pull request, run what CI gates on:

```bash
bun run lint
bun run typecheck
bun run typecheck:bun
bun run check:comments
bun run check:migrations
bun run check:content-tokens
bun run check:ledger
bun run check:notifications
bun run check:audit
bun run test
bun run test:e2e
bun run build
```

`bun run test` is the unit and integration suites, and finishes in under a second. `bun run
test:e2e` is the slow half: it drives a real browser against a single dev server it boots and owns,
emptying the database between suites, and names each suite as it starts so a slow run says which
suite is slow (0029). CI gates on the first; the second runs nightly and on demand.
`bun test <file>` still runs one suite on its own.

### Example data

```bash
bun run seed
```

Rooms, members with memberships, and a week of bookings, into `.data/db/sqlite.db`. It prints the
credentials it generated **once**, and there is no way to read a password back afterwards. It
refuses to run against production or any database that is not local, exiting non-zero and saying
why; there is no flag to override that, because the only reason to add one is the mistake it exists
to prevent (K-120).

Run it again and it adds people without duplicating rooms.

### Developer tools

Running locally, `/dev` seeds a persona per role plus a plain member, a guest and a tombstone,
signs in as any of them without a password, and shows the local mailbox alongside the permissions
the current session resolves to. It is an authentication bypass, so it does not exist in a build:
`nuxt.config` leaves the page and its routes out of the bundle, and `tests/unit/dev-tools.test.ts`
greps a built `.output` to prove it (K-124).

`bun run shots` writes a picture of every admin screen at two widths into `.shots/`, which is
gitignored. It gates nothing and CI never runs it; it is there so a visual change can be reviewed
from the images rather than from the diff.

The migration tooling is standalone and has its own instructions in
[`migration/README.md`](migration/README.md); the application never imports from it.

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
