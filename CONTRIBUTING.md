# Contributing to Proscenium

Thanks for working on the New Theatre's box office. This guide covers the practical conventions;
the reasoning behind the codebase lives in [`docs/`](docs/), and you should read
[docs/01-getting-started.md](docs/01-getting-started.md) in full before your first change.

## Prerequisites

- **Bun** (latest stable): `bun.lock` is the only lockfile. Use Bun so you resolve the same
  dependency tree as everyone else; do not introduce an `npm`/`pnpm`/`yarn` lockfile.
- **Node.js 20 LTS or newer**: some tooling (Wrangler, Drizzle Kit, esbuild) still shells out to
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
  `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`. Keep the summary in the imperative and specific.
  A message like `fix: but actually this time` (yes, it is in the history) helps nobody at
  handover.
- Prefer smaller, self-contained commits over one large one.

## Before you push

CI runs on every pull request ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) and gates on
every one of these. Run them locally first: it is much faster than waiting for the workflow:

```bash
bun run typecheck         # type errors
bun run lint              # ESLint (bun run lint:fix to autofix)
bun run check:comments    # comment length, and em dashes anywhere
bun run check:user-refs   # a users.id reference that skipped the estate hooks
bun run check:training    # training mode reaching an operational table
bun run check:migrations  # a rebuild that would cascade away dependents, or drop a trigger
bun run build             # the production Worker bundle must build
```

## Changing the database schema

`server/db/schema/*.ts` is the source of truth. To change it (full detail in
[docs/01-getting-started.md](docs/01-getting-started.md) §8):

1. Edit the relevant file in `server/db/schema/`.
2. `bunx nuxt db generate`, then **read the generated `.sql` before committing**. SQLite rebuilds
   tables for most constraint changes, and a rebuild fails silently in three directions under D1:
   any column missing from the copying `INSERT` loses its data; the `DROP TABLE` **cascades to every
   dependent row**, because `PRAGMA foreign_keys=OFF` is a no-op inside a transaction; and it takes
   the table's **triggers**, which live only in hand-authored migrations and which no regenerate can
   re-emit. Generate additions, renames and constraint changes as **separate migrations** so nothing
   is rebuilt; `bun run check:migrations` refuses the dangerous shape
   ([ADR-0037](docs/decisions/0037-a-table-rebuild-takes-its-dependents-with-it.md),
   [ADR-0042](docs/decisions/0042-a-rebuild-also-drops-what-the-snapshot-cannot-see.md)).
3. Restart `bun run dev`; the dev plugin applies the migration locally.
4. Commit the schema change, the new `.sql` file, **and** the `meta/` snapshot **together**:
   splitting them across commits corrupts the migration history for everyone else.
5. **Merging to `main` applies it to production.** `.github/workflows/migrate.yml` runs
   `nuxt db migrate` on any push to `main` that touches `server/db/migrations/**`. Nothing runs on a
   pull request.

That last point changes what review is for. Additive changes: a new nullable column, a new table, a
new index: can just be merged. **Anything destructive** (dropping or renaming a column or table,
narrowing a constraint, rewriting data) **should be applied by hand before merging**, because the
workflow cannot sequence itself against Cloudflare's deploy and a destructive migration is where that
race hurts. See [docs/08-operations.md](docs/08-operations.md) §5, which spells out the ordering and
the manual sequence.

Never hand-edit an already-applied migration file. Editing one *before* it has been applied anywhere
is fine, and sometimes necessary: `0016_lying_maverick.sql` is the worked example.

## Documentation

Documentation is part of the change, not an afterthought: a committee turns over every year and the
next maintainer cannot ask you. Follow the conventions in [docs/README.md](docs/README.md):

- **British English**, sentence-case headings.
- **State what is, not what should be.** Where the code is wrong, document the behaviour and link to
  [docs/09-known-issues.md](docs/09-known-issues.md); do not document the intent as if it were the
  behaviour.
- **Numbers with provenance.** If you quote a figure, say where it came from and when.

When you fix something listed in [docs/09-known-issues.md](docs/09-known-issues.md), update or remove
that entry in the same change.

## Comments

Enforced by `bun run check:comments`, which CI runs. There are no exemptions.

1. **Two lines of text, maximum.** Delimiters do not count. Most comments should
   be a few words. Past two lines you are writing a doc, not a comment.
2. **Route headers are one line: what it does.** The method and path are the
   filename, and the auth is the guard on the line below.
3. **No JSDoc block tags.** No `@param`, `@returns`, `@props`, `@emits`,
   `@route`, `@example`. The signature and the types already say it.
4. **No narrated history.** Not "used to", "originally", "an earlier version".
   The rule is a comment; the incident that taught it is an ADR.
5. **No figures a comment cannot keep true.** Row counts and percentages go in
   `docs/`, dated, where something updates them.

Anything that does not fit has somewhere to go:

| What it is | Where it goes |
| --- | --- |
| A reason that needs a paragraph | an ADR in `docs/decisions/` |
| An enum, a lifecycle, a column list | `docs/`: the data model or API reference |
| An endpoint's full contract | `docs/`: the API reference |
| A trap that would cost someone an evening | an ADR, cited from a one-line comment |

The comment then states the constraint and cites where the argument lives:
```
// MUST NOT throw: authorize() would run the handler unchecked (ADR-0008).
```

## Em dashes

`bun run check:comments` also fails on any em dash (U+2014), in code, comments, UI copy and docs
alike, **including its HTML entity spellings**: named, decimal and hexadecimal. A Vue template
decodes an entity at build time and a mail client decodes one on the way in, so an entity is the
same banned character to every reader, and it would otherwise be a legal way to write one. Use a comma, a colon, a semicolon, parentheses, or two sentences. The rule is the estate's
(see the workspace `CLAUDE.md`); the check is what makes it real, because a hard rule nothing tests
is a rule the codebase quietly stops following.

If you want one for a range, use an en dash or the word "to".

## Architecture decisions

Record significant decisions as ADRs in [docs/decisions/](docs/decisions/): see
[ADR-0001](docs/decisions/0001-record-architecture-decisions.md). Write one when a decision would
otherwise have to be reverse-engineered (a schema shape, a choice between libraries, a deliberate
limitation); do not write one for routine implementation. ADRs are numbered sequentially and are
immutable once accepted: supersede one by writing a new ADR that says so, rather than editing the
old one.
