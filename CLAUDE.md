# CLAUDE.md — working on newtheatre/proscenium

Guidance for Claude Code sessions in this repo. A human (usually the NNT IT Manager) reviews everything; write code and docs they can hand to a successor.

## What this is

The Nottingham New Theatre's public website **and** its box office — one Nuxt 4 app on Cloudflare Workers, serving `newtheatre.org.uk`. It sells tickets, takes money at the door, and holds a decade of imported sales history. **A bug here can cost the theatre money or turn a real customer away at the door**, so bias towards refusing an operation over performing it ambiguously.

## Commands

```bash
bun install            # deps (Bun is the package manager — bun.lock is the only lockfile)
bun run dev            # local dev server on :3000
bunx nuxt db generate  # generate a migration from schema changes (review the SQL!)
bun run lint           # eslint
bun run typecheck      # nuxt typecheck
bun run build          # the production Worker bundle must build
bunx wrangler d1 ...   # production D1 — read docs/08-operations.md before touching
```

There is no test suite. CI gates on typecheck, lint and build ([.github/workflows/ci.yml](.github/workflows/ci.yml)); seeding is via Nuxt DevTools → Tasks → `db:seed`.

## Source of truth & docs discipline

- **Code is truth; docs follow it.** A PR that changes behaviour updates the matching doc in the same PR. Schema → `docs/03-domain-model.md`; endpoints → `docs/07-api-reference.md`; anything an operator does → `docs/08-operations.md`; a bug you did not fix → `docs/09-known-issues.md`.
- **Reasoning lives in `docs/decisions/`, not in comments.** Comments are capped at two lines and CI enforces it — see [CONTRIBUTING.md](CONTRIBUTING.md) §Comments.
- New architectural choice, or reversing an old one → an ADR in `docs/decisions/` (template in that folder's README). Never edit an accepted ADR; supersede it.

## Invariants — do not break these

1. **This app never writes the session.** `getUserSession()` is read-only; the sealed `nnt-session` cookie belongs to stage-door. Sole exception: `server/routes/dev-login.get.ts`, guarded by `import.meta.dev`.
2. **`sessionUserForAuthorization()` must never throw.** `nuxt-authorization`'s `authorize()` swallows any non-`AuthorizationError` and then runs the handler *unchecked* — throwing there grants rather than denies. Staleness is expressed as data. ([ADR-0008](docs/decisions/0008-roles-go-stale-identity-does-not.md))
3. **One seat-counting rule.** Every capacity figure goes through `countOccupiedSeats`; every path that consumes capacity calls `assertCapacity`, including status changes that reinstate a reservation. ([ADR-0007](docs/decisions/0007-one-seat-counting-rule.md))
4. **No statement's bound-parameter count may depend on how many rows it covers.** D1 caps at 100 per statement, and this fails in production long after it passes in dev. Scope by subquery, never by an `IN` built from a result set. ([ADR-0006](docs/decisions/0006-d1-bound-parameter-limit.md))
5. **Erasure is anonymisation, never deletion**, and `ensureLocalUser` must refuse to write over an anonymised row — a role-less customer's cookie stays readable for 30 days and would otherwise undo the erasure on their next page load. ([ADR-0014](docs/decisions/0014-anonymise-never-delete.md))
6. **Collection is the payment boundary.** `PENDING` tickets are edited; `COLLECTED`/`DOOR` tickets are refunded. Never both. ([ADR-0011](docs/decisions/0011-collection-is-the-payment-boundary.md))
7. **The booking reference is not a credential.** Guest access is a signed, expiring `?t=` token. Do not reintroduce `?ref=`. ([ADR-0009](docs/decisions/0009-signed-booking-access-tokens.md))
8. **Customer-facing responses are column allow-listed.** Without an explicit `columns` list Drizzle returns everything, including `staffNotes` and `legacyRef` — the latter re-identifies anonymised bookers.
9. **List endpoints page in SQL** and return the `Paginated<T>` envelope, never a bare array. ([ADR-0005](docs/decisions/0005-paginate-list-endpoints-in-sql.md))
10. **`server/plugins/0.secrets-store.ts` keeps its `0.` prefix.** It must run before any plugin reads a session, or the isolate memoises an empty session password, permanently and silently. ([ADR-0016](docs/decisions/0016-hydrate-secrets-before-any-session-read.md))

## Repo conventions

- Drizzle schema in `server/db/schema/`, one file per domain area; migrations generated then hand-reviewed — D1 is SQLite, so most constraint changes are table rebuilds and a column missing from the copying `INSERT` silently loses its data.
- **Merging to `main` applies migrations to production.** Anything destructive is applied by hand before merging — see [CONTRIBUTING.md](CONTRIBUTING.md) and `docs/08-operations.md` §5.
- Zod for every request body and query string. One route = one file under `server/api/`.
- Admin pages fetch on the server with `$fetch: useRequestFetch()`; a plain `useFetch` does not forward the session cookie and 403s during SSR. ([ADR-0013](docs/decisions/0013-admin-pages-fetch-on-the-server.md))
- Table `data` is always bound to a computed returning an array — never `?? []` at the binding, which sends `UTable` into a render loop. ([ADR-0012](docs/decisions/0012-admin-table-conventions.md))
- Money is pence, everywhere, until it is formatted. Dates are formatted through `app/utils/format.ts` with `Europe/London` pinned; the Worker runs in UTC.
- British English in UI copy and docs.

## Things Claude Code should proactively flag

- Any `IN (…)` built from a result set, or any query whose parameter count grows with the data.
- Any new capacity-consuming path that does not call `assertCapacity`.
- Any customer-facing response built without a `columns` allow-list.
- Drift between `docs/07-api-reference.md` and the actual routes.
- A comment over two lines — see [CONTRIBUTING.md](CONTRIBUTING.md) §Comments; `bun run check:comments` catches it.
