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

There is no CI. Deploys are run by hand from a developer machine, from a clean, up-to-date `main`.

| Step | Command | Notes |
| --- | --- | --- |
| 1. Sync | `git checkout main && git pull` | Deploy from `main`, never from a feature branch |
| 2. Install | `bun install` | Ensures the lockfile's dependency tree |
| 3. Lint | `bunx eslint .` | There is no CI to catch this for you |
| 4. Build | `bun run build` | Produces `.output/`, including the generated `wrangler.json` and the copied migrations |
| 5. Smoke test locally | `bun run preview` | Runs the built Worker through Wrangler locally |
| 6. Deploy | `bunx wrangler --cwd .output deploy` | `--cwd .output` is what makes Wrangler read the generated config |
| 7. Verify | Load <https://newtheatre.org.uk>, load `/whats-on`, log in, open `/admin/box-office` | Roughly 60 seconds of manual checking |

If the change includes a schema change, apply the migration **before** deploying the code that depends on it — see §5.

**Never deploy during a performance.** A deploy replaces the Worker; in-flight requests are handled, but a mistake at 19:25 on a Friday means a box office queue and no way to sell tickets.

### Managing secrets

Secrets live on the Worker, not in the repository, and survive deploys. Set or rotate one with:

```bash
bunx wrangler --cwd .output secret put NUXT_SESSION_PASSWORD
# or, without a build present:
bunx wrangler secret put NUXT_SESSION_PASSWORD --name proscenium
```

| Secret | Consequence if missing in production |
| --- | --- |
| `RESEND_API_KEY` | **The entire site goes down.** `server/utils/resend.ts` throws at module load, so the Worker fails to start and every request errors. See `docs/01-getting-started.md` §5. |
| `NUXT_SESSION_PASSWORD` | Nobody can log in; sessions cannot be sealed. Must be at least 32 characters |
| `NUXT_RESEND_FROM_EMAIL` | Falls back to `no-reply@tickets.newtheatre.org.uk`; sends fail if that address is not verified in Resend |

List what is currently set (names only — values cannot be read back):

```bash
bunx wrangler secret list --name proscenium
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

## 5. Running a migration against production

Migrations are **never** applied automatically in production — not at build, not at deploy, not at boot. They are a deliberate manual act.

### Before you start

1. Take a backup (§6). Non-negotiable.
2. Check there is no performance on sale in the next hour or so — `/admin` shows what is upcoming.
3. Read the generated `.sql`. If it contains `PRAGMA foreign_keys=OFF` and a `__new_*` table, it is a full table rebuild: SQLite copies the data across via an explicit `INSERT … SELECT`, and **any column omitted from that list is silently dropped**. On a large `tickets` or `reservations` table this is also the slowest and riskiest kind of migration.

### Option A — NuxtHub CLI over the D1 HTTP API (preferred)

```bash
export NUXT_HUB_CLOUDFLARE_ACCOUNT_ID=…
export NUXT_HUB_CLOUDFLARE_DATABASE_ID=01a75263-87a9-452a-a4a0-b3b9db71dfe5
export NUXT_HUB_CLOUDFLARE_API_TOKEN=…      # needs D1 edit permission
NODE_ENV=production bunx nuxt db migrate
```

This is what the line at the bottom of the repository `README.md` is referring to. It prints the resolved dialect and driver before doing anything — **read that line**. If it says `libsql` rather than `d1`, it is pointed at your local file, and you should stop and work out why before continuing.

### Option B — Wrangler

After a `bun run build` has copied the migrations into `.output/server/db/migrations/`:

```bash
bunx wrangler --cwd .output d1 migrations list proscenium --remote
bunx wrangler --cwd .output d1 migrations apply proscenium --remote
```

Both routes record applied migrations in the same `_hub_migrations` table, so they interoperate and you can switch between them.

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

```bash
openssl rand -hex 32                                       # generate; needs 32+ characters
bunx wrangler secret put NUXT_SESSION_PASSWORD --name proscenium
```

**Rotating invalidates every existing session immediately.** Every logged-in user — customers and staff alike — is signed out and must log in again. Nothing is lost, but do not do it fifteen minutes before curtain-up. Rotate at a quiet time, then confirm you can still log in yourself.

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
- [ ] Walk the incident checklists in §8 end to end, on paper, with the incoming holder.
- [ ] Re-read this document and correct anything that has drifted. A runbook nobody edits is a runbook nobody trusts.

---

## 10. Gaps

Things that do not exist. None of these are hypothetical improvements — each one is a way an incident gets worse or longer.

| Gap | Consequence | Recommendation |
| --- | --- | --- |
| **No CI** | Nothing checks a pull request. Lint failures and broken builds are found by whoever deploys next, by hand | Add a GitHub Actions workflow on pull requests running `bun install`, `bunx eslint .` and `bun run build` — perhaps an hour's work, and it catches most of what currently reaches production |
| **No automated backups** | The only backups are ones a human remembered to take. D1 Time Travel covers 30 days, which mitigates but does not replace this | Add a scheduled GitHub Actions job running `wrangler d1 export` weekly and uploading the artefact to committee storage, with a retention window agreed against the data policy |
| **No staging environment** | Every change is tested for the first time in production, against real bookings and real customers | Create a second D1 database and a `proscenium-staging` Worker on a `staging.` subdomain, deployed from `main` before production. This is the single highest-value item on this list |
| **No uptime monitoring** | If the site goes down at 02:00 nobody knows until someone tries to buy a ticket. Discovery is currently "a customer emails us" | Point a free monitor (UptimeRobot, Better Stack, or a Cloudflare Health Check) at `https://newtheatre.org.uk/whats-on` at five-minute intervals, alerting the IT Manager and the duty box office phone |
| **No error tracking** | Exceptions exist only in Worker logs, which nobody reads proactively and which no-one is alerted about. Intermittent booking failures could run for weeks unnoticed | Add Sentry (its Nuxt SDK supports the Cloudflare Workers runtime) or, at minimum, a Cloudflare Logpush destination and an alert on error rate |
| **No tests** | No safety net for changes to the booking, pricing or capacity logic | Start with Vitest over the pure helpers in `server/utils/tickets.ts` and `shared/utils/abilities/` — highest value per hour, and it gives CI something meaningful to run |
| **No `.env.example`** | Every new developer rediscovers the environment variables from scratch, usually via a stack trace | Commit a `.env.example` mirroring the table in `docs/01-getting-started.md` §4 |
| **No documented on-call** | "Ring the IT Manager" is the whole escalation policy | Agree with committee who covers performance nights and record the number in the box office folder, alongside a printed copy of §8 |

Until the monitoring and staging gaps are closed, the practical mitigations are: deploy early in the day, never during a performance week if it can wait, always back up before migrating, and keep a paper fallback at the box office.
