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
| `RESEND_API_KEY` | `server/utils/resend.ts` — `process.env.RESEND_API_KEY`, directly, at module load | **Yes, in every environment** | The module throws at import time. Because `server/utils/*.ts` are auto-imported into the Nitro bundle, **the entire Worker fails to boot** — not just email. The whole site returns 500. See §5. |
| `NUXT_SESSION_PASSWORD` | `nuxt-auth-utils`, mapped to `runtimeConfig.session.password` | **Yes in production.** Auto-generated in dev | Session cookies cannot be sealed or unsealed. Nobody can log in; existing sessions become invalid. Must be at least 32 characters. In dev, `nuxt-auth-utils` generates a random one and **appends it to your `.env` file automatically** on first run. |
| `NUXT_RESEND_FROM_EMAIL` | `nuxt.config.ts` → `runtimeConfig.resendFromEmail`, read in `server/utils/email.ts` | No | Falls back to the hard-coded `no-reply@tickets.newtheatre.org.uk`. If that address is not verified in Resend, every send fails with a 500 from `sendEmail()`. |
| `NUXT_RESEND_API_KEY` | Implied by `runtimeConfig.resendApiKey` in `nuxt.config.ts` | **No — declared but never read** | Nothing. `runtimeConfig.resendApiKey` is declared and never consumed anywhere in the codebase. Setting it alone will not make email work. See §5. |
| `NUXT_PUBLIC_BASE_URL` | Maps to `runtimeConfig.public.baseURL`, defaulted to `https://newtheatre.org.uk` | No | Overrides the canonical site URL used by `@nuxtjs/seo`. Note the naming bug in §6 — this is *not* currently what the email links use. |

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
# Required or the Worker will not boot at all
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx

# Optional; sender address must be verified in Resend
NUXT_RESEND_FROM_EMAIL=no-reply@tickets.newtheatre.org.uk

# nuxt-auth-utils will append NUXT_SESSION_PASSWORD here on first `bun run dev`
```

If you have no Resend key at all and only want the site to boot, put any non-empty placeholder in `RESEND_API_KEY`. The application will start; any action that actually sends an email (registration, password reset, booking confirmation) will fail at send time instead of at boot.

---

## 5. The Resend key naming problem — read this before debugging email

There are **three different names for what should be one secret**, and they do not agree:

| Name | Where it appears | Is it actually used? |
| --- | --- | --- |
| `RESEND_API_KEY` (bare, no `NUXT_` prefix) | `server/utils/resend.ts`: `process.env.RESEND_API_KEY` | **Yes — this is the only one that does anything.** |
| `NUXT_RESEND_API_KEY` | Implied by `runtimeConfig.resendApiKey` in `nuxt.config.ts`, and documented in the JSDoc at the top of `server/utils/email.ts` | No. Nothing reads `runtimeConfig.resendApiKey`. |
| `runtimeConfig.resendApiKey` | Declared in `nuxt.config.ts` | No. Declared, empty, never consumed. |

Two consequences you need to internalise:

1. **`server/utils/resend.ts` throws at module load**, not at send time:

   ```ts
   if (!process.env.RESEND_API_KEY) {
     throw new Error('RESEND_API_KEY is not set in environment variables')
   }
   ```

   This runs when the module is first imported, which on Cloudflare Workers happens during Worker start-up. A missing key therefore takes down **the entire site**, including pages that have nothing to do with email. On a Worker this presents as every request returning an error, with the thrown message in `wrangler tail`.

2. **Reading `process.env` directly is the wrong pattern on Cloudflare.** Workers do not have a real `process.env`; Nitro polyfills it, and values populated only via `runtimeConfig` will not appear there reliably. The correct fix is to move the client construction inside a function and read `useRuntimeConfig().resendApiKey`, so that `NUXT_RESEND_API_KEY` becomes the single canonical name and a missing key degrades email only. Until someone does that, **set the bare `RESEND_API_KEY` everywhere — locally in `.env`, and in production as a Worker secret.**

---

## 6. Known bug: email links point at `undefined`

`nuxt.config.ts` declares:

```ts
runtimeConfig: { public: { baseURL: 'https://newtheatre.org.uk' } }
```

but every link-building function in `server/utils/email.ts` reads:

```ts
const { public: { baseUrl } } = useRuntimeConfig()
```

`baseUrl` (lower-case `u`) is not a declared key, so it is `undefined`. Verification links, password-reset links and booking links currently render as `undefined/verify-email?token=…`. Either rename the config key to `baseUrl` or fix the five read sites to `baseURL`. Flagged here because it will confuse you the first time you test the sign-up flow locally.

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
| `server/db/migrations/sqlite/*.sql` | Generated SQL, applied in numeric order. Currently `0000` through `0008`. Never hand-edit an already-applied file. |
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

## 11. Linting

ESLint is configured (`@nuxt/eslint` with stylistic rules enabled in `nuxt.config.ts`) but **`package.json` has no `lint` script**. Run it directly:

| Command | What it does |
| --- | --- |
| `bunx eslint .` | Lint everything |
| `bunx eslint . --fix` | Lint and auto-fix (most stylistic rules are fixable) |
| `bunx eslint app/pages/admin/users.vue` | Lint one file |

`eslint.config.mjs` imports `./.nuxt/eslint.config.mjs`, so **`nuxt prepare` must have run first** or ESLint fails on a missing import. Adding `"lint": "eslint ."` and `"lint:fix": "eslint . --fix"` to `package.json` is an obvious improvement.

## 12. Tests

**There are none.** No test runner, no test files, no test script. Any change you make is verified by running it. Be correspondingly careful with the booking and payment-adjacent paths, and test them manually against seeded data before deploying.

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
