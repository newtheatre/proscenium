# 01 — Getting Started

This document gets you from a clean laptop to a working local copy of **Proscenium**, the Nottingham New Theatre's public website and box office.

Everything below is written from what is actually in the repository at the time of writing. Where the code contradicts itself or a documented command does not exist, that is called out explicitly rather than smoothed over — you will hit these, and it is faster to know in advance.

---

## 1. What the application is

| Thing | What it is here |
| --- | --- |
| Framework | Nuxt 4 (`nuxt ^4.3.1`), Vue 3, Nuxt UI 4 |
| Server runtime | Nitro with the `cloudflare_module` preset — the server runs as a **Cloudflare Worker**, not Node |
| Database | SQLite. Locally a file; in production **Cloudflare D1** (Cloudflare's managed SQLite) |
| ORM / migrations | Drizzle ORM + Drizzle Kit, wrapped by NuxtHub's `hub:db` layer |
| File storage | **Cloudflare R2** (S3-like object storage) for show posters and venue images, via NuxtHub's blob layer |
| Auth | `nuxt-auth-utils` (sealed cookie sessions) + `nuxt-authorization` (ability checks) |
| Email | Resend |
| Marketing pages | `@nuxt/content` v3, Markdown in `content/`, stored in the same database |
| Deployment | NuxtHub module config + Wrangler to Cloudflare Workers (see `docs/08-operations.md`) |

Repository: <https://github.com/newtheatre/proscenium>

### Directory tour

```
app/                 Nuxt app (pages, components, layouts, middleware, composables)
content/             Markdown for the static marketing pages
server/api/          REST endpoints (shows, venues, reservations, bookings, users, admin)
server/db/schema/    Drizzle table definitions — the source of truth for the schema
server/db/migrations/sqlite/   Generated SQL migrations (do not hand-edit)
server/routes/images/[...pathname].get.ts   Serves R2 blobs at /images/**
server/tasks/        Nitro tasks — currently just db:seed
server/utils/        Email, auth tokens, image upload, query helpers, validation
shared/utils/abilities/   Authorisation rules shared between client and server
public/              Static assets served as-is
```

---

## 2. Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| **Bun** | Latest stable | The only lockfile in the repo is `bun.lock`. Use Bun so you resolve the same dependency tree everyone else has. |
| Node.js | 20 LTS or newer | Some tooling (Wrangler, Drizzle Kit, esbuild) still shells out to Node. Bun alone is usually fine, but having Node installed avoids surprises. |
| Git | Any recent | Cloning. |
| A Cloudflare account | — | **Only** needed for production work (deploys, migrations against production, logs). You do not need one to run locally. |

> **Caveat:** `package.json` has no `packageManager` field, so nothing enforces Bun or pins its version. The presence of `bun.lock` is the only signal. If you use `npm install` or `pnpm install` you will generate a second lockfile and a different dependency tree — don't. Adding `"packageManager": "bun@<version>"` to `package.json` would be a worthwhile five-minute fix.

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

---

## 3. Clone and install

```bash
git clone https://github.com/newtheatre/proscenium.git
cd proscenium
bun install
```

`bun install` runs the `postinstall` script, which is `nuxt prepare`. That generates the `.nuxt/` directory: TypeScript types, auto-import declarations, the Drizzle config that the database CLI reads, and `.nuxt/eslint.config.mjs` — which the root `eslint.config.mjs` imports. **If `.nuxt/` is missing, both linting and the database CLI will fail.** Re-run `bunx nuxt prepare` if you ever delete it.

---

## 4. Environment variables

There is **no `.env.example` in the repository**, so nothing tells you what to set. Create a `.env` in the project root (it is gitignored). This is the full list of variables the code actually reads.

### Runtime variables (needed by the running application)

| Variable | Read from | Required? | What breaks without it |
| --- | --- | --- | --- |
| `NUXT_SESSION_PASSWORD` | Dev: `.env` → `runtimeConfig.session.password`. Production: the Secrets Store `SESSION_PASSWORD` binding, written into the same place by `server/plugins/0.secrets-store.ts` | **Yes in production.** Auto-generated in dev | The `nnt-session` cookie cannot be unsealed, so nobody is logged in anywhere. This is the **estate-wide** seal shared with every `*.newtheatre.org.uk` app — in production it is never set on this worker, only bound from the store (ADR-0016), so never generate your own. Must be at least 32 characters. In dev, `nuxt-auth-utils` generates a random one and **appends it to your `.env`** on first run. |
| `NUXT_AUTH_SERVICE_TOKEN` | `runtimeConfig.authServiceToken` | **Yes in production** | Every path that needs a shadow account fails closed with a 502 *"Booking is temporarily unavailable"*: guest checkout, staff walk-ins, issuing a pass, creating a mirror user. It is also the token whose SHA-256 authenticates the inbound GDPR hooks, so erasure and subject-access requests from the auth service stop working. |
| `NUXT_TRAINING_API_TOKEN` | `runtimeConfig.trainingApiToken`, read in `server/utils/eligibility.ts` | No, but **set it in production** | Nothing breaks and nothing errors, which is the danger: with no token the eligibility seam takes the same path as an outage, so **every shift claim is allowed and flagged for review** ([ADR-0026](./decisions/0026-eligibility-is-read-from-rehearsal-behind-one-seam.md)). Fine in development, quietly useless in production. Pair it with `NUXT_TRAINING_API_BASE_URL` if training ever moves. |
| `NUXT_BOOKING_TOKEN_SECRET` | `runtimeConfig.bookingTokenSecret` | No, but **set it in production** | Falls back to `NUXT_SESSION_PASSWORD`. That works, but it signs guest booking links with the estate-wide seal — so rotating the seal (the emergency estate logout lever) also invalidates every booking link already sitting in customers' inboxes, and any other estate app holding the seal could mint booking tokens. |
| `NUXT_RESEND_API_KEY` | `runtimeConfig.resendApiKey`, read in `server/utils/resend.ts` | No, but email is dead without it | No email at all — confirmations, cancellations, reminders. The client is constructed lazily and logs `[Email] No Resend API key configured; email sending is disabled.` rather than throwing, so the site stays up. The bare `RESEND_API_KEY` is still read as a fallback for older deployments; prefer the `NUXT_` form. |
| `NUXT_RESEND_FROM_EMAIL` | `runtimeConfig.resendFromEmail`, read in `server/utils/email.ts` | No | Falls back to the hard-coded `no-reply@tickets.newtheatre.org.uk`. If that address is not verified in Resend, every send fails. |
| `NUXT_PUBLIC_BASE_URL` | `runtimeConfig.public.baseURL`, defaulted to `https://newtheatre.org.uk` | No | The canonical site URL used by `@nuxtjs/seo` **and by every link in every email**. Wrong value here means confirmation and booking links point at the wrong host. |
| `NUXT_PUBLIC_AUTH_BASE_URL` | `runtimeConfig.public.authBaseURL`, defaulted to `https://auth.newtheatre.org.uk` | No | Where login, account and session-refresh links point. Only override it if you are running a local auth service. |

### Build- and CLI-time variables (not needed by the running app)

| Variable | Read from | Required? | What breaks without it |
| --- | --- | --- | --- |
| `NUXT_HUB_CLOUDFLARE_ACCOUNT_ID` | `@nuxthub/core` database CLI (`nuxt db …`) | Only when running database commands against **production** D1 | `bunx nuxt db migrate` against production throws: *"D1 CLI commands require Cloudflare API credentials."* Local development is unaffected. |
| `NUXT_HUB_CLOUDFLARE_DATABASE_ID` | Same | Same. In this repo the production database id is also hard-coded in `nuxt.config.ts`, so the env var is usually redundant | As above. |
| `NUXT_HUB_CLOUDFLARE_API_TOKEN` | Same | Same — and there is no hard-coded fallback for this one | As above. Needs a Cloudflare API token with D1 edit permission. |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Wrangler | Only for deploys, `wrangler tail`, `wrangler d1 …` | Wrangler falls back to an interactive browser login, which is fine for a human but not for automation. |
| `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | `@nuxthub/core` database resolution | No — **do not set these** | If both are present, NuxtHub silently switches your local database to a remote Turso instance instead of the local SQLite file. Mentioned only so you recognise the symptom. |

### A minimal working `.env` for local development

```dotenv
# Optional; without it email is disabled and logs a warning — the site still runs
NUXT_RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx

# Optional; sender address must be verified in Resend
NUXT_RESEND_FROM_EMAIL=no-reply@tickets.newtheatre.org.uk

# Only needed if you want guest checkout, walk-ins or passes to work locally,
# since all of them call the auth service for a shadow account. Ask the ITM.
NUXT_AUTH_SERVICE_TOKEN=nnt_svc_xxxxxxxxxxxx

# nuxt-auth-utils will append NUXT_SESSION_PASSWORD here on first `bun run dev`
```

You can start with an empty `.env`. Nothing is required for the site to boot: email degrades to a
logged warning, and `/dev-login?staff=admin` seals a local session without any auth service running
(see §9).

---

## 5. Email configuration

`server/utils/resend.ts` constructs the Resend client **lazily**, inside `getResend()`:

```ts
const key = useRuntimeConfig().resendApiKey || process.env.RESEND_API_KEY
if (!key) {
  console.warn('[Email] No Resend API key configured; email sending is disabled.')
  return null
}
```

So the canonical name is **`NUXT_RESEND_API_KEY`** (which populates `runtimeConfig.resendApiKey`),
with the bare `RESEND_API_KEY` kept as a fallback for deployments configured before the rename.
Set the `NUXT_` form on anything new.

A missing key disables email and logs that warning; it does **not** take the site down. This used to
be a module-load `throw`, which on a Worker meant a missing key returned an error for every request
on the site, including pages with nothing to do with email.

When email is misbehaving:

1. **Nothing arriving at all?** Check `wrangler tail` for `[Email] No Resend API key configured` —
   that is a missing secret, not a Resend problem.
2. **Sends failing?** Check the Resend dashboard: key still valid, sending domain still verified,
   messages not bouncing or rate-limited. A failed send logs `[Email] Failed to send email:`.
3. **Wrong sender?** With `NUXT_RESEND_FROM_EMAIL` unset the code falls back to
   `no-reply@tickets.newtheatre.org.uk`, which must be verified in Resend.
4. **Links wrong?** They are built from `runtimeConfig.public.baseURL` (`NUXT_PUBLIC_BASE_URL`).

## 6. Signing in locally

Identity lives in the central auth service (stage-door), and this app only ever *reads* the sealed
`nnt-session` cookie. You do not need the auth service running to develop.

`GET /dev-login` seals a local session for you — the single sanctioned exception to "apps never
write the session", guarded by `import.meta.dev` so it does not exist in a production build:

| URL | Session you get |
| --- | --- |
| `/dev-login` | An ordinary logged-in customer |
| `/dev-login?staff=box-office` | `proscenium:BOX_OFFICE` |
| `/dev-login?staff=manager` | `proscenium:MANAGER` |
| `/dev-login?staff=admin` | `proscenium:ADMIN` |
| `/dev-login?staff=foh-manager` | `proscenium:FOH_MANAGER` |
| `/dev-login?staff=front-of-house` | `proscenium:FRONT_OF_HOUSE` |

`front-of-house` is the one worth using deliberately: `/foh` is scoped by the rota, so that persona
sees only what it is confirmed on, and `db:seed` rosters it on the door of a performance tonight so
there is something to see ([ADR-0019](./decisions/0019-the-rota-scopes-the-front-of-house-role.md)).

The client middleware sends logged-out visitors here in dev and to the hosted login in production.

Two things that will confuse you otherwise:

- **Roles are namespaced.** The session carries `proscenium:ADMIN`, not `ADMIN`, because one estate
  session holds every app's roles. Compare with `hasRole`/`isStaff` from
  `shared/utils/abilities/types.ts`, never against a bare string.
- **Staff sessions go stale after 15 minutes** and lose their roles until refreshed. In dev the
  middleware skips the refresh bounce, but the server-side rule still applies — if staff-only API
  calls start 403-ing after a while, hit `/dev-login?staff=…` again.

---

## 7. Running the development server

```bash
bun run dev
```

Then open <http://localhost:3000>. Nuxt DevTools is enabled (`devtools: { enabled: true }`) — the floating toolbar at the bottom of the page is how you reach the seed task later.

What happens on the first run, so nothing surprises you:

- NuxtHub creates a local data directory `.data/` (gitignored):
  - `.data/db/sqlite.db` — your local database, driven by `@libsql/client`. **Not** D1; D1 only exists in production.
  - `.data/blob/` — local stand-in for the R2 bucket. Uploaded posters land here.
- A NuxtHub dev-only Nitro plugin applies any pending migrations to that SQLite file automatically. You do not run a migrate command in development.
- `nuxt-auth-utils` generates `NUXT_SESSION_PASSWORD` and appends it to `.env`.
- The database is **empty**. Nothing is on sale, and there are no users. Seed it — §9.

### Available scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Development server with HMR on port 3000 |
| `bun run build` | Production build into `.output/` (Cloudflare Worker bundle) |
| `bun run preview` | Runs the built output through Wrangler locally |
| `bun run generate` | **Do not use.** NuxtHub aborts the process — this app needs a server |
| `bun run postinstall` | `nuxt prepare`; runs automatically after install |

---

## 8. Database workflow

### Where things live

| Path | Purpose |
| --- | --- |
| `server/db/schema/*.ts` | Drizzle table definitions — `user.ts`, `venue.ts`, `show.ts`, `ticket.ts`, `reservation.ts`. **This is the source of truth.** |
| `server/db/migrations/sqlite/*.sql` | Generated SQL, applied in numeric order. Currently `0000` through `0016`. Never hand-edit an already-applied file. |
| `server/db/migrations/sqlite/meta/` | Drizzle's snapshots and `_journal.json`. Committed; generated. Do not edit. |
| `_hub_migrations` (table, in the database) | Ledger of which migrations have been applied. Both NuxtHub and Wrangler use this same table name. |

Server code never imports these files directly — it imports `db` and `schema` from the virtual modules `@nuxthub/db` / `hub:db:schema`, which NuxtHub generates from the schema directory during `nuxt prepare`.

### The `nuxt db` commands

`@nuxthub/core` ships a `nuxt-db` binary that the Nuxt CLI exposes as the `db` subcommand. Both spellings work:

| Command | What it does |
| --- | --- |
| `bunx nuxt db generate` | Diffs `server/db/schema/*.ts` against the last snapshot and writes a new numbered `.sql` migration. Runs `nuxt prepare` first. |
| `bunx nuxt db migrate` | Applies pending migrations to the currently-configured database and records them in `_hub_migrations`. |
| `bunx nuxt db mark-as-migrated` | Records migrations as applied **without running them**. For adopting an existing database. Dangerous; know why you are using it. |
| `bunx nuxt db drop <table>` | Drops one table. |
| `bunx nuxt db drop-all` | Drops **every** table. Prompts you to type `confirm`. |
| `bunx nuxt db squash` | Collapses the migration history into one file. |
| `bunx nuxt db sql "<query>"` | Runs an ad-hoc SQL query. |

That is the complete list in `@nuxthub/core@0.10.6`. Anything else you read about does not exist here.

### Changing the schema

1. Edit the relevant file in `server/db/schema/`.
2. `bunx nuxt db generate` — inspect the generated `.sql` before committing it. SQLite cannot alter most constraints in place, so Drizzle rebuilds tables: you will see `PRAGMA foreign_keys=OFF`, a `__new_*` table, a copying `INSERT … SELECT`, a `DROP TABLE`, and a `RENAME`. Migration `0008_left_ikaris.sql` is a good example. **Read the copying `INSERT` carefully — any column missing from it silently loses its data.**
3. Restart `bun run dev`; the dev plugin applies the migration locally.
4. Commit the schema change, the `.sql` file, *and* the `meta/` snapshot together. Splitting them across commits corrupts the migration history for everyone else.
5. Applying it to production is a deliberate, separate step — see `docs/08-operations.md`.

### How migrations reach production

Different from development, and worth understanding:

- In **development**, a NuxtHub Nitro plugin applies migrations on server start.
- With the **D1 driver**, NuxtHub explicitly disables build-time migrations. `bun run build` will *not* migrate anything.
- At build time, the migration `.sql` files are copied into `.output/server/db/migrations/`, and the generated Wrangler config is annotated with `migrations_dir` and `migrations_table: _hub_migrations`.
- Applying them in production is therefore a **manual step**, either `nuxt db migrate` over the D1 HTTP API or `wrangler d1 migrations apply`. Both routes use the same ledger table, so they interoperate. Procedure and safety notes: `docs/08-operations.md` §5.

---

## 9. Seeding local data

The seed lives in `server/tasks/seed.ts` (task name `db:seed`) with per-entity modules in `server/tasks/seed/`. It relies on Nitro's **experimental tasks** feature, enabled in `nuxt.config.ts` via `nitro.experimental.tasks`.

With `bun run dev` running, choose either:

- **Nuxt DevTools → Tasks tab → `db:seed`** (what `server/tasks/seed/README.md` recommends), or
- `curl -X POST http://localhost:3000/_nitro/tasks/db:seed`

The task is guarded: if the `users` table has any rows it logs *"Database already has users. Skipping seed."* and does nothing. To re-seed you must empty the database first.

Seed order (dependency order — keep it if you add to it): users → venue features → venues → ticket types → shows and performances → reservations.

### Seeded accounts

All use the password `DevPassword123!`:

| Email | Roles |
| --- | --- |
| `admin@newtheatre.org.uk` | `ADMIN`, `MANAGER`, `BOX_OFFICE` |
| `manager@newtheatre.org.uk` | `MANAGER` |
| `boxoffice@newtheatre.org.uk` | `BOX_OFFICE` |
| `user@newtheatre.org.uk` | none (ordinary customer) |
| `unverified@newtheatre.org.uk` | none, email unverified — for testing the verification flow |

These are development fixtures. They must never exist in production; `docs/08-operations.md` covers creating real staff accounts.

---

## 10. Resetting your local database — the contradiction, resolved

`server/tasks/seed/README.md` gives two different reset commands:

- Under "Running Seeds": `bunx nuxt db drop-all`
- Under "Troubleshooting": *"Reset with `bunx nuxt db push --force` first"* — and `server/tasks/seed.ts` prints the same advice at runtime.

**`nuxt db push` does not exist.** The `db` command in `@nuxthub/core@0.10.6` has exactly seven subcommands (§8), and `push` is not one of them; it is Drizzle Kit vocabulary that leaked into the docs. Running it gives you an unknown-command error. `drop-all` is the correct command of the two.

Use whichever suits:

| Method | Command | Notes |
| --- | --- | --- |
| **Recommended for local** | Stop the dev server, then `rm -rf .data/db`, then `bun run dev` | Deletes the local SQLite file outright. The dev plugin recreates it and re-applies every migration from scratch. Fastest, and cannot half-succeed. |
| Drop tables in place | `bunx nuxt db drop-all` (type `confirm` at the prompt), then restart the dev server | Works against whichever database is configured — including production if your environment points there. Check twice before running. |
| Nuclear | `rm -rf .data` | Also clears local blob storage, so uploaded posters go too. |

Someone should correct the two stale references in `server/tasks/seed/README.md` and the `console.log` in `server/tasks/seed.ts`.

---

## 11. Linting and typechecking

| Command | What it does |
| --- | --- |
| `bun run lint` | Lint everything |
| `bun run lint:fix` | Lint and auto-fix (most stylistic rules are fixable) |
| `bun run typecheck` | `vue-tsc` over the whole project |
| `bunx eslint app/pages/admin/users.vue` | Lint one file |

`eslint.config.mjs` imports `./.nuxt/eslint.config.mjs`, so **`nuxt prepare` must have run first**
or ESLint fails on a missing import. `bun install` runs it via `postinstall`.

## 12. Tests

**There are none yet.** CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs build,
typecheck and lint on every pull request, and those are hard gates — but nothing exercises
behaviour. Any change you make is verified by running it.

Be correspondingly careful with the money paths (`POST /api/bookings`,
`PUT /api/reservations/:id/tickets`, `POST /api/reservations/:id/refund`) and test them manually
against seeded data before deploying. Adding a test runner is tracked in
[09-known-issues](09-known-issues.md#no-tests).

---

## 13. Dependency hygiene — things to know before you `bun install` anything

### Packages imported but not declared

These are imported by first-party code but do not appear in `package.json`. They currently resolve only because Bun hoists them as transitive dependencies of other packages. **A dependency bump elsewhere can remove them and break the build without any change to our code.**

| Package | Imported by |
| --- | --- |
| `nanoid` | All five files in `server/db/schema/` — every primary key uses it |
| `zod` | Every server endpoint (`import { z } from 'zod/v4'`) and twelve modal components in `app/components/`. Resolves today via the transitive `zod@3.25.76`, which exposes the `zod/v4` subpath |
| `scule` | `app/pages/admin/users.vue`, `app/pages/account/index.vue` (`upperFirst`) |
| `@tanstack/table-core` | Five admin table pages — pagination and row types for Nuxt UI's table |

Fix: `bun add nanoid zod scule @tanstack/table-core`, pinning the versions currently resolved in `bun.lock`.

### Build-only tools sitting in `dependencies`

`drizzle-kit`, `better-sqlite3`, `@libsql/client`, `eslint` and `typescript` are all in `dependencies` rather than `devDependencies`. Nothing breaks — the Nitro build tree-shakes the Worker bundle — but it makes the production dependency set misleading, slows installs, and makes it harder to reason about what actually ships. `wrangler` is (correctly) the only entry in `devDependencies`.

Two nuances before you move them:

- `@libsql/client` **is** genuinely required for local development — NuxtHub uses it for the local SQLite file — so it belongs in `devDependencies`, not deleted.
- `better-sqlite3` has no import anywhere in the codebase. It looks like a leftover; check before removing, but it is a strong candidate.
- `drizzle-orm` must stay in `dependencies` — it is imported by runtime server code.

---

## 14. Checklist: your first working local instance

1. `bun install`
2. Create `.env` with `RESEND_API_KEY` (a placeholder is acceptable)
3. `bun run dev`
4. Confirm `NUXT_SESSION_PASSWORD` has appeared in `.env`
5. Open DevTools → Tasks → run `db:seed`
6. Visit <http://localhost:3000> and log in as `admin@newtheatre.org.uk` / `DevPassword123!`
7. Check `/admin` and `/admin/box-office` both load
8. `bunx eslint .` — should be clean before you start changing things

Next: `docs/08-operations.md` for deployment, migrations against production, backups and incident handling.
