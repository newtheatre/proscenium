# Contributing to Proscenium

Thanks for working on the New Theatre's box office. This guide covers the practical conventions;
the reasoning behind the codebase lives in [`docs/`](docs/), and you should read
[docs/01-getting-started.md](docs/01-getting-started.md) in full before your first change.

## Prerequisites

- **Bun** (latest stable) — `bun.lock` is the only lockfile. Use Bun so you resolve the same
  dependency tree as everyone else; do not introduce an `npm`/`pnpm`/`yarn` lockfile.
- **Node.js 20 LTS or newer** — some tooling (Wrangler, Drizzle Kit, esbuild) still shells out to
  Node.
- A Cloudflare account is needed **only** for production work (deploys, migrations against
  production). You do not need one to develop locally.

## Local setup

```bash
git clone https://github.com/newtheatre/proscenium.git
cd proscenium
bun install          # runs `nuxt prepare` via postinstall; do not delete .nuxt/
```

Create a `.env` (see [docs/01-getting-started.md](docs/01-getting-started.md) §4), then:

```bash
bun run dev          # http://localhost:3000, HMR
```

The local database starts empty. Seed it via Nuxt DevTools → Tasks → `db:seed`
([docs/01-getting-started.md](docs/01-getting-started.md) §9). Development uses a local SQLite file
under `.data/`; D1 only exists in production.

## Branches and commits

- Work on a branch, not `main`. Name it for the change: `fix/booking-confirmation-link`,
  `docs/operations-runbook`.
- Commit messages follow **Conventional Commits**, matching the existing history:
  `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`. Keep the summary in the imperative and specific
  — a message like `fix: but actually this time` (yes, it is in the history) helps nobody at
  handover.
- Prefer smaller, self-contained commits over one large one.

## Before you push

CI runs on every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) and gates on
all three of these. Run them locally first — it is much faster than waiting for the workflow:

```bash
bun run typecheck   # type errors
bun run lint        # ESLint (bun run lint:fix to autofix)
bun run build       # the production Worker bundle must build
```

## Changing the database schema

`server/db/schema/*.ts` is the source of truth. To change it (full detail in
[docs/01-getting-started.md](docs/01-getting-started.md) §8):

1. Edit the relevant file in `server/db/schema/`.
2. `bunx nuxt db generate` — then **read the generated `.sql` before committing**. SQLite rebuilds
   tables for most constraint changes, and any column missing from the copying `INSERT` silently
   loses its data.
3. Restart `bun run dev`; the dev plugin applies the migration locally.
4. Commit the schema change, the new `.sql` file, **and** the `meta/` snapshot **together** —
   splitting them across commits corrupts the migration history for everyone else.
5. **Merging to `main` applies it to production.** `.github/workflows/migrate.yml` runs
   `nuxt db migrate` on any push to `main` that touches `server/db/migrations/**`. Nothing runs on a
   pull request.

That last point changes what review is for. Additive changes — a new nullable column, a new table, a
new index — can just be merged. **Anything destructive** (dropping or renaming a column or table,
narrowing a constraint, rewriting data) **should be applied by hand before merging**, because the
workflow cannot sequence itself against Cloudflare's deploy and a destructive migration is where that
race hurts. See [docs/08-operations.md](docs/08-operations.md) §5, which spells out the ordering and
the manual sequence.

Never hand-edit an already-applied migration file. Editing one *before* it has been applied anywhere
is fine, and sometimes necessary — `0016_lying_maverick.sql` is the worked example.

## Documentation

Documentation is part of the change, not an afterthought — a committee turns over every year and the
next maintainer cannot ask you. Follow the conventions in [docs/README.md](docs/README.md):

- **British English**, sentence-case headings.
- **State what is, not what should be.** Where the code is wrong, document the behaviour and link to
  [docs/09-known-issues.md](docs/09-known-issues.md); do not document the intent as if it were the
  behaviour.
- **Numbers with provenance.** If you quote a figure, say where it came from and when.

When you fix something listed in [docs/09-known-issues.md](docs/09-known-issues.md), update or remove
that entry in the same change.

## Comments

A comment carries what the code cannot: a constraint, a trap, a contract that is not obvious from
the signature. It does not narrate, and it does not argue.

- **State the rule, not the story.** "Must not throw — `authorize()` swallows any other error and
  then runs the handler unchecked" is a comment. "An earlier version threw a 401, which meant a
  staff member could not see their own bookings after fifteen minutes" is an ADR.
- **Reasoning goes to [docs/decisions/](docs/decisions/).** If the *why* needs a paragraph, it needs
  an ADR; the comment then cites it — `(ADR-0008)` — and stops.
- **Do not restate the code.** `@param count — Number of rooms selected` says nothing the signature
  does not. A component header listing "Features:" is out of date by the next release, and nothing
  fails when it is.
- **No unprovenanced figures.** A comment cannot honestly carry "45,563 tickets", because nothing
  updates it. Put the number in the ADR, dated, and refer to the shape of the problem here.
- **Say plainly when something is not implemented**, at the thing that is not implemented.

One to five lines is the usual size. Past about ten, ask whether you are writing an ADR.

## Architecture decisions

Record significant decisions as ADRs in [docs/decisions/](docs/decisions/) — see
[ADR-0001](docs/decisions/0001-record-architecture-decisions.md). Write one when a decision would
otherwise have to be reverse-engineered (a schema shape, a choice between libraries, a deliberate
limitation); do not write one for routine implementation. ADRs are numbered sequentially and are
immutable once accepted — supersede one by writing a new ADR that says so, rather than editing the
old one.
