# 08 — Operations Runbook

For whoever holds the IT Manager role. This covers running **Proscenium** — the Nottingham New Theatre's public website and box office — in production: deploying, rolling back, migrating, backing up, reading logs, and what to do when it breaks during a show.

Read `docs/01-getting-started.md` first if you have not set the project up locally. Several failure modes in §8 are only intelligible if you know how the environment variables work.

---

## 1. Cloudflare concepts in ninety seconds

You do not need to be a Cloudflare expert, but these five terms appear constantly.

| Term | What it means here |
| --- | --- |
| **Worker** | A small server-side programme that runs on Cloudflare's edge network instead of on a machine we rent. Our entire Nuxt server is one Worker, named `proscenium`. There is no SSH, no server to log into, no disk to fill up. |
| **Binding** | How a Worker is granted access to a resource. Bindings are declared in configuration and appear to the code as global objects — our database arrives as the binding `DB`, our file storage as `BLOB`. If a binding is missing, the code sees `undefined` and fails at runtime, not at deploy time. |
| **D1** | Cloudflare's managed SQLite database. Same SQL as the local file you develop against, but accessed through the `DB` binding. It has a point-in-time restore feature called Time Travel (§6). |
| **R2** | Cloudflare's object storage — an S3-alike. We keep uploaded show posters and venue images there, in a bucket named `proscenium-blob`. |
| **Wrangler** | Cloudflare's command-line tool. Deploys the Worker, streams logs, runs SQL against D1, manages secrets. Installed as a dev dependency; run it with `bunx wrangler`. |

**Secrets** are environment variables stored encrypted against the Worker. They persist across deploys and are not in the repository. They are set with `wrangler secret put` and are invisible afterwards — you can replace one but never read it back.

---

## 2. What is deployed, and where it is configured

There is no `wrangler.toml` in the repository. The Wrangler configuration is **generated at build time** into `.output/wrangler.json`, from the `nitro.cloudflare.wrangler` block in `nuxt.config.ts` plus bindings that the NuxtHub module injects. `nuxt.config.ts` is therefore the single place to change infrastructure.

| Item | Value | Where it is set |
| --- | --- | --- |
| Worker name | `proscenium` | `nitro.cloudflare.wrangler.name` |
| Custom domain | `newtheatre.org.uk` | `nitro.cloudflare.wrangler.routes`, `custom_domain: true` |
| Custom domain | `proscenium.newtheatre.org.uk` | Same |
| D1 binding | `DB` | `nitro.cloudflare.wrangler.d1_databases`, and again via `$production.hub.db` |
| D1 database name | `proscenium` | Same |
| **D1 database id** | `01a75263-87a9-452a-a4a0-b3b9db71dfe5` | Hard-coded in **two** places: `nitro.cloudflare.wrangler.d1_databases[0].database_id` and `$production.hub.db.connection.databaseId`. Keep them in step. |
| | | **August 2026:** these ids previously pointed at `proscenium-testing` (`c4200074-…`) while the name said `proscenium`, so production ran on the testing database. The live data was copied into `proscenium` and the ids corrected — see "Database cutover" below. |
| R2 binding | `BLOB` | `$production.hub.blob.binding` |
| **R2 bucket name** | `proscenium-blob` | `$production.hub.blob.bucketName` |
| Observability logs | Enabled | `nitro.cloudflare.wrangler.observability.logs.enabled` |
| KV / cache | Disabled | `hub.kv: false`, `hub.cache: false`. A commented-out cache namespace id exists in `nuxt.config.ts` if it is ever wanted. |
| Migrations table | `_hub_migrations` | Injected by NuxtHub into the generated Wrangler config |
| Migrations directory | `.output/server/db/migrations/` | Same |
| Redirect | `/mailing-list/` → Mailchimp signup | `nitro.routeRules` |
| Redirect | `/alumni/registration`, `/alumni/register` (with and without a trailing slash) → `alumni.newtheatre.org.uk/register` | `nitro.routeRules`, via the `ALUMNI_SIGNUP_URL` constant at the top of `nuxt.config.ts` |

`custom_domain: true` means Cloudflare routes the whole hostname to the Worker and manages the DNS record and certificate for it. Both hostnames hit the same Worker and therefore the same database.

### The `// FIXME:` on the D1 driver

```ts
$production: {
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'd1', // FIXME: https://github.com/nuxt-hub/core/pull/775
      connection: { databaseId: '01a75263-87a9-452a-a4a0-b3b9db71dfe5' },
    },
```

What this pins around, based on how `@nuxthub/core@0.10.6` actually resolves database configuration:

- Left to itself, NuxtHub picks the driver by inspecting the environment: it only switches SQLite to the `d1` driver when the hosting provider looks like Cloudflare **and** the build is neither a dev run nor a `nuxt prepare` run. During `nuxt prepare` it deliberately falls back to the local libsql file.
- Every database CLI command (`nuxt db migrate`, `nuxt db drop-all`, …) runs `nuxt prepare` first and then reads the config it produced. Under auto-detection, that config would describe the **local SQLite file**, not production D1 — so there would be no supported way to point the CLI at production.
- Pinning `driver: 'd1'` with an explicit `connection.databaseId` forces the D1 path regardless of detection, and gives the CLI the database id it needs to talk to the D1 HTTP API (it takes the account id and API token from `NUXT_HUB_CLOUDFLARE_*`). It also makes NuxtHub register the `DB` binding itself, and — because the `d1` driver disables build-time migrations — guarantees `bun run build` never tries to migrate anything.

The FIXME means: **this pin is a workaround, and when the upstream pull request ships in a released version of `@nuxthub/core`, re-test whether the explicit `driver` and `connection` block can be deleted.** The pull request could not be read from this environment, so treat that as the intent rather than a description of its contents. If you do remove the pin, verify all three of: `bunx nuxt db migrate` still targets production, the generated `.output/wrangler.json` still contains the `DB` binding with the right database id, and a production deploy still boots.

---

## 3. Deploying

CI runs on every pull request and push to `main` (`.github/workflows/ci.yml`: install → build →
typecheck → lint, all hard gates), and Cloudflare builds and deploys the Worker automatically when
`main` moves. The manual sequence below remains the fallback for when the automatic pipeline is
unavailable — and steps 1–5 are still what you run locally before opening a PR.

| Step | Command | Notes |
| --- | --- | --- |
| 1. Sync | `git checkout main && git pull` | Deploy from `main`, never from a feature branch |
| 2. Install | `bun install` | Ensures the lockfile's dependency tree |
| 3. Lint | `bunx eslint .` | CI also catches this, but red CI after pushing is slower than a local check |
| 4. Build | `bun run build` | Produces `.output/`, including the generated `wrangler.json` and the copied migrations |
| 5. Smoke test locally | `bun run preview` | Runs the built Worker through Wrangler locally |
| 6. Deploy | `bunx wrangler --cwd .output deploy` | `--cwd .output` is what makes Wrangler read the generated config |
| 7. Verify | Load <https://newtheatre.org.uk>, load `/whats-on`, log in, open `/admin/box-office` | Roughly 60 seconds of manual checking |

If the change includes a schema change, apply the migration **before** deploying the code that depends on it — see §5.

**Never deploy during a performance.** A deploy replaces the Worker; in-flight requests are handled, but a mistake at 19:25 on a Friday means a box office queue and no way to sell tickets.

### Managing secrets

Secrets live on the Worker, not in the repository, and survive deploys. Set or rotate one with:

```bash
bunx wrangler --cwd .output secret put NUXT_RESEND_API_KEY
# or, without a build present:
bunx wrangler secret put NUXT_RESEND_API_KEY --name proscenium
```

**`NUXT_SESSION_PASSWORD` is the exception — it is not a worker secret.** It is
shared with every other app on the estate, so it lives in the account Secrets
Store and this Worker binds it as `SESSION_PASSWORD`
(`nuxt.config.ts` → `secrets_store_secrets`, hydrated by
`server/plugins/0.secrets-store.ts`). The auth service's runbook owns rotation —
stage-door `docs/operations.md`, ADR-0016. Rotating it there needs no deploy
here.

| Secret | Consequence if missing in production |
| --- | --- |
| `RESEND_API_KEY` | **The entire site goes down.** `server/utils/resend.ts` throws at module load, so the Worker fails to start and every request errors. See `docs/01-getting-started.md` §5. |
| `NUXT_SESSION_PASSWORD` (Secrets Store) | Nobody can log in; `/api/_auth/session` returns 500 while the homepage still serves, which makes it easy to miss. Must be at least 32 characters |
| `NUXT_RESEND_FROM_EMAIL` | Falls back to `no-reply@tickets.newtheatre.org.uk`; sends fail if that address is not verified in Resend |

List what is currently set (names only — values cannot be read back):

```bash
bunx wrangler secret list --name proscenium                  # worker secrets
bunx wrangler versions view <version-id> --name proscenium   # includes store bindings
```

---

## 4. Rolling back

Cloudflare keeps previous versions of the Worker, so a bad deploy can be undone in under a minute.

| Step | Command |
| --- | --- |
| List recent deployments and version ids | `bunx wrangler deployments list --name proscenium` |
| Roll back to a previous version | `bunx wrangler rollback <version-id> --name proscenium` |
| Confirm | `bunx wrangler deployments list --name proscenium` again; load the site |

Wrangler's rollback subcommands have moved between major versions; if the above is rejected, check `bunx wrangler rollback --help` and `bunx wrangler versions --help`. The Cloudflare dashboard (Workers & Pages → `proscenium` → Deployments) offers the same rollback through a UI and is a perfectly good fallback under pressure.

**Rolling back code does not roll back the database.** Migrations are not reversed. If the failed deploy also applied a migration that the previous code cannot cope with, you must additionally restore the database (§6). This is the single strongest argument for applying migrations as a separate, earlier step, and for writing them so old and new code can both run against the new schema.

Rolling back also does not revert secrets or R2 contents.

---

## 4a. Scheduled tasks

**This worker has three cron triggers**, `*/15 * * * *`, `0 4 * * *` and `0 10 * * *`, declared in `nuxt.config.ts` under
`nitro.scheduledTasks` and mirrored into the generated Wrangler config as
`triggers.crons`. Both halves are needed: the schedule tells Nitro what to run, the trigger tells
Cloudflare to call it.

| Task | What it does |
| --- | --- |
| `backstage:sweep` | Deletes backstage **free text** older than 30 days. Preset calls are kept: they carry the milestone the curtain-up record and the end-of-night report are built from (`docs/11` §5.5) |
| `access:sweep` | Marks verified access profiles `EXPIRED` past their date, and deletes withdrawals after 30 days. Expiry is housekeeping, not deletion: the person can renew (`docs/12` §2.5) |
| `comps:sweep` | Marks unanswered comp requests `EXPIRED`, every 15 minutes. **Tidying only**: expiry is derived at read and refused at approval, so a missed run changes no behaviour (`docs/13` §4.1.2) |
| `shifts:remind` | Emails everyone confirmed on tomorrow's performances, with an ICS attachment. **Not idempotent**: running it twice sends twice, which is why it is scheduled once and not retried |

Run one by hand in development with `POST /_nitro/tasks/<name>` — note the name is the task's
`meta.name` (`backstage:sweep`), not its file path. In production, check it ran with
`bunx wrangler tail proscenium` around 04:00, or look at the Worker's cron invocations in the
dashboard.

**A task that fails is silent.** Nothing pages anyone. If a sweep matters to you, check it.

## 5. Running a migration against production

**Migrations apply automatically when `main` moves.** `.github/workflows/migrate.yml` runs
`nuxt db migrate` on any push to `main` that touches `server/db/migrations/**`, and records a Time
Travel bookmark in the run summary before it applies anything. It never runs on a pull request.

Migrations are still **not** applied at build, at deploy, or at boot — `applyMigrationsDuringBuild`
is `false`, and Cloudflare's deploy does not touch the database. The workflow is the only automatic
path.

### The ordering problem

The workflow does not deploy, and it cannot sequence itself against the deploy. Cloudflare Workers
Builds reacts to the same push independently, so on every merge two things start at once:

| | typical |
| --- | --- |
| `migrate` workflow | ~1 minute |
| Cloudflare build + deploy | ~3–5 minutes |

The migration almost always lands first, which is the order NuxtHub requires — but **it is a race,
not a guarantee**. If the deploy wins, the new Worker runs against the old schema until the
migration catches up.

That is survivable for an additive migration and not for a destructive one. So:

- **Additive changes** (new nullable column, new table, new index) — just merge.
- **Destructive changes** (dropping or renaming a column or table, narrowing a constraint, rewriting
  data) — apply by hand *before* merging, with the manual sequence below, then merge. The workflow
  will find nothing pending and no-op. This is what was done for `0016_lying_maverick`.

A destructive migration is also the case where you want a human watching, which is the other reason
not to leave it to a push trigger.

### Knowing when the race was lost

`GET /api/health` compares the migration journal compiled into the running build against the
`_hub_migrations` ledger, and returns **503 with the pending filenames** when the schema is behind
the code. It is public, because monitoring cannot hold a session.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://newtheatre.org.uk/api/health
curl -s https://newtheatre.org.uk/api/health | jq
```

That is what to check first after merging a schema change, and what to point uptime monitoring at.
A green build and a green deploy are not evidence the Worker can serve a request: the estate outage
on 2026-08-19 reported `ok: true` for the whole hour it was down
(stage-door ADR-0021, which this endpoint is the second half of).

Both ledger spellings are folded together, because production carries a mix: `nuxt-db migrate`
records `0016_lying_maverick` and `wrangler d1 migrations apply` records `0016_lying_maverick.sql`.
Which spelling a row has says nothing about whether it ran.

### `nuxt db migrate` exits 0 when it fails — use `nuxt-db`

The `db` subcommand on the main Nuxt CLI **swallows the exit code**. A migration that errors outright
logs `[error] Failed to create migrations table` and then exits `0`, so a CI step wrapping it goes
green having applied nothing. Reproduced on both `@nuxthub/core` 0.10.6 and 0.10.8:

```
nuxt db migrate   →  exit 0   ✗
nuxt-db migrate   →  exit 1   ✓
```

`nuxt-db` and `nuxt-hub` are the binaries `@nuxthub/core` installs, and they propagate properly.
`.github/workflows/migrate.yml` uses `./node_modules/.bin/nuxt-db migrate`, and then re-reads the
ledger anyway via `.github/scripts/pending-migrations.sh` — the CLI's word is not accepted as proof
that anything landed. This is the same class of failure as the `migrations_dir` bug below: not an
error, just a cheerful exit code and nothing done.

### The migrate workflow needs the GitHub Packages token too

On 2026-08-21 the first migration since the auth-types cutover did not apply. The job died at
`bun install` with a `401` fetching `@newtheatre/auth-types`, before it reached the database:

```
error: GET https://npm.pkg.github.com/download/@newtheatre/auth-types/1.0.0/… - 401
```

`bunfig.toml` points the `@newtheatre` scope at GitHub Packages and reads `$GH_PACKAGES_TOKEN`.
When auth-types became a published package, the token was added to `ci.yml` and **not** to
`migrate.yml`, so every workflow that installs dependencies needs both the `packages: read`
permission and that env var on the install step. All four estate repos had the same gap.

It went unnoticed for two days because the workflow only runs on a push that touches
`server/db/migrations/**`, and nothing had added a migration since. **A workflow that only runs
when it is needed is a workflow that is only tested when it is needed** — which is the argument for
`workflow_dispatch` being on it, and for running it by hand after any change to how dependencies
are installed.

The failure was safe: the job dies before the Time Travel bookmark and before the apply step, so
nothing is half-applied. What it leaves behind is a deploy whose code is ahead of the schema, which
is what `GET /api/health` now reports (§5).

### `@nuxthub/core` must be at least 0.10.8 for the CLI to reach D1

0.10.6's CLI posts to `https://api.cloudflare.com/client/v4/accounts/{account}/d1/db/{id}/raw`.
Cloudflare's D1 API is `/d1/**database**/{id}/raw`, and the wrong path answers with
`{"code":10001,"message":"Unable to authenticate request"}` — which reads like a credentials problem
and is not one. The same package's *runtime* template had the correct path all along, so only the
CLI was affected. Fixed in 0.10.8.

If migrations start failing to authenticate while `wrangler d1 execute` works with the same token,
check this first.

### Applying one by hand

Still the right move for anything destructive, and the fallback when the workflow is broken.

### Before you start

1. Take a backup (§6). Non-negotiable.
2. Check there is no performance on sale in the next hour or so — `/admin` shows what is upcoming.
3. Read the generated `.sql`. If it contains `PRAGMA foreign_keys=OFF` and a `__new_*` table, it is a full table rebuild: SQLite copies the data across via an explicit `INSERT … SELECT`, and **any column omitted from that list is silently dropped**. On a large `tickets` or `reservations` table this is also the slowest and riskiest kind of migration.
4. If that rebuild touches a table other tables reference, read the next section before going any further.

### `PRAGMA foreign_keys=OFF` does nothing on D1

Drizzle opens every table rebuild with `PRAGMA foreign_keys=OFF` and closes it with `=ON`. **On D1 both lines are inert.** Cloudflare runs each migration inside an implicit transaction with foreign keys enforced, and documents that a query cannot change that; `PRAGMA defer_foreign_keys = ON` does not stop `ON DELETE CASCADE` either.

That matters when the rebuilt table is a **parent**. `DROP TABLE parent` with enforcement on deletes its rows first, which fires `ON DELETE CASCADE` and empties the children — before any later statement in the same file gets to look at them. Every rebuild in this repo up to `0015` happened to touch a child table, which is why this had never bitten.

Locally the opposite is true: migrations run statement-by-statement with no transaction and the pragma is honoured. **A migration of this shape succeeding in dev proves very little about production.** Rehearse it against a throwaway D1 database loaded from a production export.

If you need to rebuild a parent table, hand-edit the generated file (permitted before it has been applied anywhere — see `CONTRIBUTING.md`) to drop the child first, then the parent, then recreate parent-then-child. `0016_lying_maverick.sql` is the worked example, and [ADR-0004](decisions/0004-content-warning-model.md) explains why.

### Option A — NuxtHub CLI over the D1 HTTP API (preferred)

```bash
export NUXT_HUB_CLOUDFLARE_ACCOUNT_ID=…
export NUXT_HUB_CLOUDFLARE_DATABASE_ID=01a75263-87a9-452a-a4a0-b3b9db71dfe5
export NUXT_HUB_CLOUDFLARE_API_TOKEN=…      # needs D1 edit permission
NODE_ENV=production bunx nuxt db migrate
```

This is what the line at the bottom of the repository `README.md` is referring to. It prints the resolved dialect and driver before doing anything — **read that line**. If it says `libsql` rather than `d1`, it is pointed at your local file, and you should stop and work out why before continuing.

### Option B — Wrangler

After a `bun run build` has copied the migrations into `.output/server/db/migrations/sqlite/`:

```bash
bunx wrangler --cwd .output/server d1 migrations list proscenium --remote
bunx wrangler --cwd .output/server d1 migrations apply proscenium --remote
```

**`--cwd .output/server`, not `--cwd .output`.** The generated Wrangler config is written to
`.output/server/wrangler.json`, and from `.output` Wrangler cannot find it — it fails with
*"No configuration file found"*, which at least tells you something is wrong. (`.wrangler/deploy/
config.json` redirects Wrangler to that config for deploys, but is not honoured by the `d1
migrations` subcommands in Wrangler 4.x, so the `--cwd` is still needed here.)

**Always run `list` before `apply`, and read what it prints.** `migrations_dir` is pinned in
`nuxt.config.ts` because NuxtHub's default for it (`.output/server/db/migrations/`) is resolved by
Wrangler *relative to the config file*, landing on a path that does not exist — and the failure mode
was not an error but `✅ No migrations to apply!` and an exit code of 0. If you ever see that message
when you know a migration is outstanding, do not believe it: check `list` output against
`server/db/migrations/sqlite/` before concluding production is up to date.

### The two routes do not share a name format — pick one and stay on it

Both write to `_hub_migrations`, but they disagree about what a migration is called:

| Route | Value stored in `name` |
|---|---|
| `nuxt db migrate` (Option A) | `0015_lovely_stryfe` — `.sql` stripped |
| `wrangler d1 migrations apply` (Option B) | `0015_lovely_stryfe.sql` — filename as-is |

So they do **not** interoperate, whatever an earlier version of this document said. Apply a migration
with one and the other still considers it pending, and will re-run it. That is survivable for a
migration that happens to be idempotent and fatal for one that is not.

**Option A (`nuxt db migrate`) is now the route of record**, because that is what
`.github/workflows/migrate.yml` runs. It needs `NUXT_HUB_CLOUDFLARE_*` credentials, which live as
repository secrets rather than on anyone's laptop.

Option B (wrangler) remains the practical choice for a manual, destructive migration, because it
authenticates with the wrangler login the committee already has. **If you apply one that way, record
the Option A name too, or the workflow will re-run it on the next push:**

```bash
# after `wrangler d1 migrations apply` recorded `0017_name.sql`
bunx wrangler d1 execute proscenium --remote \
  --command "INSERT INTO \"_hub_migrations\" (name) values ('0017_name')"
```

That is exactly what `nuxt db mark-as-migrated 0017_name` writes — one row, nothing else — and it is
the supported command when you have the API credentials to hand.

The 2026-08-13 ledger recovery wrote both formats for `0000`–`0014` for exactly this reason.
`0016_lying_maverick` was applied with wrangler on 2026-08-14 and its Option A name backfilled the
same day, when the workflow was introduced.

### The ledger was recovered on 2026-08-13 — history

For a period ending 2026-08-13, `_hub_migrations` was **empty** on a fully populated production
database: the schema was there, the record of how it got there was not. Nobody noticed because the
broken `migrations_dir` above meant `list` always answered "nothing to do".

The recovery, kept here because the same shape of problem could recur:

1. Verified production was genuinely at `0014` — `0014`'s dropped tables absent, `users` carrying
   exactly the post-`0014` columns, and `pass_admissions.ticket_id` still `cascade` (so `0015` had
   not run).
2. Took a Time Travel bookmark first.
3. Backfilled `0000`–`0014` into the ledger, **in both name formats**, without running anything.
4. Confirmed `list` then showed only `0015` outstanding.
5. Applied `0015`, and verified the foreign key had flipped to `restrict`, all four indexes were
   back, and the row counts were unchanged.

The lesson worth keeping: `mark-as-migrated` and hand-written ledger inserts are only safe once you
have *proved* the schema matches the migration you are claiming was applied. Prove it first.

### Afterwards

- `bunx wrangler d1 execute proscenium --remote --command "SELECT name FROM _hub_migrations ORDER BY name DESC LIMIT 5"` to confirm what landed.
- Deploy the code (§3).
- Load the site and exercise the affected area.

---

## 6. Backup and restore

**There is no automated backup.** Taking one is a manual task; do it before every migration and on a routine you actually keep (see §9).

### Taking a D1 backup

| What | Command |
| --- | --- |
| Full backup (schema + data) | `bunx wrangler d1 export proscenium --remote --output=proscenium-$(date +%F).sql` |
| Schema only | `bunx wrangler d1 export proscenium --remote --no-data --output=schema-$(date +%F).sql` |
| One table | `bunx wrangler d1 export proscenium --remote --table=reservations --output=reservations-$(date +%F).sql` |

The output is plain SQL. **It contains customer names, email addresses and booking history** — it is personal data. Store it somewhere access-controlled (the committee Google Drive, in the IT folder), never in the repository, never in a public Drive folder, and delete old copies in line with the theatre's retention policy.

### Restoring

```bash
bunx wrangler d1 execute proscenium --remote --file=proscenium-2026-08-10.sql
```

An export contains `CREATE TABLE` statements, so restoring over a database that still has those tables will fail. A real restore usually means: create a fresh D1 database, import into it, verify, then repoint `database_id` in `nuxt.config.ts` and redeploy. **Practise this once before you need it.**

### Time Travel — the fast route

D1 keeps a continuous 30-day history and can be restored to any point in it. This is usually faster and better than a file restore for "we ran the wrong SQL five minutes ago":

```bash
bunx wrangler d1 time-travel info proscenium
bunx wrangler d1 time-travel restore proscenium --timestamp=2026-08-10T18:30:00Z
```

Restoring is destructive to anything written after that timestamp — bookings taken in the interval are lost. Note the current time before you restore, so you know exactly what window needs re-entering by hand from the box office paper record.

### R2

There is no backup of the R2 bucket at all. Its contents are show posters and venue images — recoverable by re-uploading, but a nuisance. `bunx wrangler r2 object get proscenium-blob/<key> --file=<local>` fetches individual objects; a bulk copy needs `rclone` with an R2-compatible S3 endpoint.

---

## 7. Blobs: where images live and how they are served

- Uploads go through `server/utils/images.ts` (`validateAndUploadImage`): JPEG, PNG and WebP only, maximum 5 MB, filename generated as `image-<timestamp>.<ext>`.
- Path prefixes: `shows/<showId>/…` (posters, `server/api/shows/[id]/poster.post.ts`) and `venues/<venueId>/…` (`server/api/venues/[id]/image.post.ts`). The database stores the pathname, not the bytes.
- Replacing an image deletes the previous object first. A failed delete is logged and swallowed, so it does not block the upload.
- Serving is `server/routes/images/[...pathname].get.ts`, i.e. `https://newtheatre.org.uk/images/shows/<id>/image-123.jpg`. It sets `Content-Security-Policy: default-src 'none'` on every response — so that if someone manages to upload something that a browser would treat as HTML, it cannot load scripts, styles or subresources. **Do not remove that header.**
- Locally the same code path writes to `.data/blob/` instead of R2, so image handling is testable without Cloudflare credentials.

**Known wart:** deleting a show (`DELETE /api/shows/:id`) removes the database rows but does not delete the poster from R2. Orphaned objects accumulate. Harmless at our scale, but worth a tidy-up task eventually.

---

## 8. Logs and incidents

### Reading logs

| What | Command |
| --- | --- |
| Live tail | `bunx wrangler tail proscenium --format pretty` |
| Errors only | `bunx wrangler tail proscenium --status error` |
| From the built output | `bunx wrangler --cwd .output tail` |

Observability is enabled in the Worker config, so logs are also retained and searchable in the Cloudflare dashboard (Workers & Pages → `proscenium` → Logs). Use the dashboard for anything historical; `wrangler tail` only shows what happens while it is running.

Also worth checking during an incident: <https://www.cloudflarestatus.com> (is it us or them?) and the Resend dashboard for email delivery.

---

### Incident: box office is down during a performance

**Keep selling.** The show does not stop for the software.

1. **Fall back to paper immediately.** Take names, ticket types and payment on paper. Everything can be entered afterwards; a queue in the foyer cannot be undone.
2. Establish the blast radius: does the public site load? Does `/whats-on` load? Does `/admin/box-office` load? A dead public site *and* a dead admin means the Worker itself; a working public site with a broken admin page means an application error.
3. `bunx wrangler tail proscenium --format pretty` and reproduce the failure. Look for the exception. A boot-time throw (§8, email section) shows as the same error on every single request.
4. Check <https://www.cloudflarestatus.com> for D1 or Workers incidents in Europe.
5. If a deploy went out in the last few hours, **roll it back** (§4) before diagnosing further. Restoring service beats understanding it.
6. If the cause is a migration applied today, consider Time Travel to just before it (§6) — accepting that bookings taken since are lost and must be re-entered from the paper record.
7. Afterwards: enter the paper bookings, and write up what happened while it is fresh.

### Incident: emails are not sending

Symptoms range from "confirmation emails never arrive" to "the whole site is 500-ing", because of how the Resend client is wired.

1. **Is the whole site down?** If so, suspect `RESEND_API_KEY` first. `server/utils/resend.ts` throws at module load when it is unset, which kills the Worker rather than just email. Check `wrangler tail` for `RESEND_API_KEY is not set in environment variables`; fix by `bunx wrangler secret put RESEND_API_KEY --name proscenium` and redeploying.
2. **Site up, emails silent?** Check the Resend dashboard: is the API key still valid, is the sending domain still verified, are messages bouncing or being rate-limited? A failed send raises a 500 from `sendEmail()` and logs `[Email] Failed to send email:` — search the logs for that string.
3. **Wrong sender?** With `NUXT_RESEND_FROM_EMAIL` unset the code falls back to `no-reply@tickets.newtheatre.org.uk`. If that address is not verified in Resend, every send fails.
4. **Emails arrive but the links are broken?** That is the known `baseUrl` / `baseURL` bug documented in `docs/01-getting-started.md` §6 — links render as `undefined/…`. It is a one-line fix and should be prioritised, since it breaks email verification and password resets outright.
5. Remember the three-way naming muddle: only the bare `RESEND_API_KEY` is actually read. Setting `NUXT_RESEND_API_KEY` alone changes nothing.

While email is broken: staff can create bookings from `/admin/box-office` and read the booking reference to the customer directly, and admins can trigger a password reset for a user from `/admin/users`.

### Incident: a migration fails part-way through

D1 has no transactional multi-statement migrations, so a migration can leave the database half-changed — particularly the table-rebuild pattern (`__new_tickets` created, old table dropped, rename not yet run).

1. **Do not re-run it.** A second attempt against a half-applied schema usually makes things worse.
2. Establish what actually landed:
   ```bash
   bunx wrangler d1 execute proscenium --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
   bunx wrangler d1 execute proscenium --remote --command "SELECT * FROM _hub_migrations ORDER BY id DESC LIMIT 5"
   ```
   A stray `__new_*` table, or a migration missing from `_hub_migrations`, tells you where it stopped.
3. **Restore.** Time Travel to just before the migration started (§6) is the cleanest option; the backup you took beforehand is the fallback. Restoring is nearly always faster and safer than hand-repairing SQLite schema state.
4. If the code deploy already went out and expects the new schema, roll it back (§4).
5. Fix the migration locally against a fresh database (`rm -rf .data/db`, `bun run dev`, re-apply everything), and only then try production again.

---

## 9. Routine tasks

### Rotating the session password

`NUXT_SESSION_PASSWORD` is the key that seals the login cookie. Rotate it when a committee member with production access leaves, if you suspect it has leaked, and at handover each year.

**Not from here.** The key is shared by every app on the estate and lives in the
account Secrets Store, so it is rotated once, centrally — follow stage-door
`docs/operations.md` §"Rotating the session seal secret". Doing it per-app is
what the Secrets Store move (ADR-0016) removed.

⚠️ **Never set `NUXT_SESSION_PASSWORD` as a worker secret on this app.** It does
not merely duplicate the store value — it *overrides* it. `nuxt-auth-utils`
resolves the password as `defu({ password: process.env.NUXT_SESSION_PASSWORD },
runtimeConfig.session)`, and `defu` gives its first argument priority, so the
worker secret wins over the binding. The symptom is confusing and points
nowhere near the cause: login on `auth.newtheatre.org.uk` succeeds, and this app
bounces the user straight back to the login page, because the two are sealing
with different keys. `server/plugins/0.secrets-store.ts` now logs a loud error
when it sees both, so check the logs (§7) before theorising.

**"Logged in on auth, but this app never shows me as logged in"** has a second
cause worth knowing, because it looks identical and produces no errors at all.
`nuxt-auth-utils` memoises the session password on the *first* session read an
isolate performs, and h3's `getSession` swallows unseal failures — so if
anything reads the session before `0.secrets-store.ts` has hydrated the
password, that isolate is anonymous for its whole life while
`/api/_auth/session` cheerfully answers `200` with a bare `{ id }`. The `0.`
prefix on that plugin is what orders it ahead of `authorization-resolver.ts`;
Nitro sorts `server/plugins/` by filename. Do not rename it, and read its
header before adding a plugin that touches sessions.

A logged-out `{ id }` with no `user` key is the signature — `curl` alone will
not distinguish it from health, so check the body, not just the status.

**Rotating invalidates every existing session.** Every logged-in user — customers and staff alike — is signed out and must log in again. Nothing is lost, but do not do it fifteen minutes before curtain-up. Rotate at a quiet time, then confirm you can still log in yourself. Workers pick the new value up as isolates recycle rather than instantly, so allow a few minutes for the estate to settle.

### Adding a staff account and granting roles

**This is no longer done from Proscenium.** Since the estate cut over to stage-door, accounts,
credentials and roles all live at `auth.newtheatre.org.uk`. There is no user-creation form, no
password reset and no role editor in this app, and there is no `user_roles` table in this database —
`users` here is a mirror of `id`, `email` and `name` only.

Roles in this app's namespace, and what they gate:

| Role | Access |
| --- | --- |
| `proscenium:ADMIN` | Everything, including deleting shows, venues and ticket types |
| `proscenium:MANAGER` | The admin area, programming, passes and refunds |
| `proscenium:BOX_OFFICE` | `/admin/box-office` only — selling and managing reservations on the door |

**Normal route:** sign in to `auth.newtheatre.org.uk/admin` as an `auth:ADMIN`, find the person, and
grant `proscenium:<ROLE>` from the roles dropdown. Role definitions (description, default expiry —
most app roles want *end of committee year*) are managed there too.

The new role takes effect when that person's session next refreshes — **up to 15 minutes**, or
immediately if they sign out and back in. Removing a role is subject to the same window. There is
nothing to do in this app either way.

**There is no emergency route from this database.** A previous version of this runbook gave an
`INSERT INTO user_roles …` command for when the admin area is unreachable; that table no longer
exists and the command fails with *"no such table"*. If the auth service itself is down, granting
access is not possible and the incident is stage-door's — see its
[operations doc](https://github.com/newtheatre/stage-door/blob/main/docs/operations.md). Front-of-house
can still take money on the door and record it afterwards.

**Removing access when someone leaves committee:** remove their roles in the auth service. Do not
delete the mirror row here — `reservations.user_id` is `ON DELETE restrict`, so anyone with a
booking cannot be deleted anyway, and their booking history has to survive for the treasurer.

**Erasing someone (a GDPR request):** also the auth service — `POST /api/users/:id/erase`, or
self-service from their `/account` page. That rewrites the central identity, bumps `session_epoch`
and calls this app's anonymise hook, retrying until it succeeds. Do not try to scrub this database
by hand: an erasure that does not go through the auth service leaves the central identity intact,
and the mirror will be repopulated from the next request that person's browser makes.

### Where alumni signup lives

Alumni signup belongs to the Alumni Network's own site, `alumni.newtheatre.org.uk`
([newtheatre/lumina](https://github.com/newtheatre/lumina)). There is no registration form, table
or endpoint in this codebase, and there should not be one. This app links to it from `/alumni`, and
four redirects carry the historical URLs there:

| URL | Who sends people there |
| --- | --- |
| `/alumni/registration`, `/alumni/registration/` | `history.newtheatre.org.uk`: the report form, both submission forms and their thank-you pages ([newtheatre/history-project](https://github.com/newtheatre/history-project)) |
| `/alumni/register`, `/alumni/register/` | The old Jekyll site's own page, so anything bookmarked or indexed before the Nuxt rebuild |

Before the alumni site existed the signup was a Google Form, embedded on `/alumni` and reachable at
none of those URLs; that form is no longer linked from this app.

If the signup path moves, it is in two places: `ALUMNI_SIGNUP_URL` at the top of `nuxt.config.ts`
for the redirects, and the call-to-action link in `content/pages/alumni.md`. Do not drop the
redirects instead: the history site is a separate project on a separate release cycle, and its
links would start 404ing the moment this deploys. If a redirect must go, raise it on
`newtheatre/history-project` first and wait for their change to ship.

### Annual handover checklist for this app

Do this in the summer, alongside the wider IT handover.

- [ ] Confirm the outgoing IT Manager has walked you through a full deploy, at least once, on a real change.
- [ ] Transfer or re-issue Cloudflare account access; remove the outgoing holder's access afterwards.
- [ ] Rotate `NUXT_SESSION_PASSWORD` (above).
- [ ] Rotate `RESEND_API_KEY` in the Resend dashboard and update the Worker secret. Confirm the sending domain is still verified and that domain DNS has not drifted.
- [ ] Rotate any `NUXT_HUB_CLOUDFLARE_API_TOKEN` used for migrations; create a fresh scoped token for the incoming holder.
- [ ] Audit `/admin/users`: remove `ADMIN` and `MANAGER` from anyone who has left committee; check no development seed accounts (`admin@newtheatre.org.uk` etc., password `DevPassword123!`) exist in production. **If they do, treat it as a security incident, not a tidy-up.**
- [ ] Confirm GitHub access to `newtheatre/proscenium` for the incoming holder, and confirm it is not the only copy of anything.
- [ ] Take a full D1 backup and store it in the committee Drive; verify you can actually read the file.
- [ ] Check the R2 bucket size and whether orphaned images (§7) need clearing.
- [ ] Open `/alumni/registration` and confirm it lands on a working signup on `alumni.newtheatre.org.uk`.
- [ ] Walk the incident checklists in §8 end to end, on paper, with the incoming holder.
- [ ] Re-read this document and correct anything that has drifted. A runbook nobody edits is a runbook nobody trusts.

---

## 10. Gaps

Things that do not exist. None of these are hypothetical improvements — each one is a way an incident gets worse or longer.

| Gap | Consequence | Recommendation |
| --- | --- | --- |

| **No automated backups** | The only backups are ones a human remembered to take. D1 Time Travel covers 30 days, which mitigates but does not replace this | Add a scheduled GitHub Actions job running `wrangler d1 export` weekly and uploading the artefact to committee storage, with a retention window agreed against the data policy |
| **No staging environment** | Every change is tested for the first time in production, against real bookings and real customers | Create a second D1 database and a `proscenium-staging` Worker on a `staging.` subdomain, deployed from `main` before production. This is the single highest-value item on this list |
| **No uptime monitoring** | If the site goes down at 02:00 nobody knows until someone tries to buy a ticket. Discovery is currently "a customer emails us" | Point a free monitor (UptimeRobot, Better Stack, or a Cloudflare Health Check) at `https://newtheatre.org.uk/whats-on` at five-minute intervals, alerting the IT Manager and the duty box office phone |
| **No error tracking** | Exceptions exist only in Worker logs, which nobody reads proactively and which no-one is alerted about. Intermittent booking failures could run for weeks unnoticed | Add Sentry (its Nuxt SDK supports the Cloudflare Workers runtime) or, at minimum, a Cloudflare Logpush destination and an alert on error rate |
| **No tests** | No safety net for changes to the booking, pricing or capacity logic | Start with Vitest over the pure helpers in `server/utils/tickets.ts` and `shared/utils/abilities/` — highest value per hour, and it gives CI something meaningful to run |
| **No `.env.example`** | Every new developer rediscovers the environment variables from scratch, usually via a stack trace | Commit a `.env.example` mirroring the table in `docs/01-getting-started.md` §4 |
| **No documented on-call** | "Ring the IT Manager" is the whole escalation policy | Agree with committee who covers performance nights and record the number in the box office folder, alongside a printed copy of §8 |

Until the monitoring and staging gaps are closed, the practical mitigations are: deploy early in the day, never during a performance week if it can wait, always back up before migrating, and keep a paper fallback at the box office.
