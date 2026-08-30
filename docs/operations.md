# Operations

What an operator does, and how. This describes only what exists today; anything listed as not
built is named as such rather than left to be discovered.

## Environments

| Environment | Database | Mail | Deploys from |
| --- | --- | --- | --- |
| Local | SQLite under `.data/`, created by NuxtHub | logged to the console | nothing, `bun run dev` |
| Production | D1 `unified` (`02c35a27-b6dc-47b0-8d9b-7a526324aca1`) | the `EMAIL` binding | Cloudflare Workers Builds, on the branch that currently deploys |

No Cloudflare account is needed to work locally.

## Deploying

Workers Builds deploys the Worker on its own when the branch moves. **It does not apply
migrations**, which is the whole reason the next section exists.

## Applying migrations

`.github/workflows/migrate.yml` runs on a push to `main` or `unified/main` that touches
`server/db/migrations/**`, and can be run by hand from the Actions tab. It never runs on a pull
request.

The job, in order:

1. Prints what the ledger says is pending, for the record.
2. **Takes a Time Travel restore point and refuses to continue without one.** The bookmark is
   printed in the run summary with the exact command to restore it.
3. Applies with `nuxt-db migrate`, not `nuxt db migrate`. The `nuxt db` proxy swallows the exit
   code, so a failed migration exits 0; that is how a run once reported success having applied
   nothing.
4. **Re-reads `_hub_migrations` and fails if anything is still pending.** Whatever the CLI
   claimed, the ledger is the truth.

### When it fails

The run summary carries the restore command, of the form:

```bash
bunx wrangler d1 time-travel restore unified --bookmark=<bookmark>
```

Restore first, then fix the migration and let the job run again. Time Travel keeps thirty days,
but finding the right bookmark after the fact means guessing at timestamps, which is why the job
pins one before it touches anything.

### What it cannot do

Applying and deploying cannot be sequenced from CI: the migration job and Workers Builds start
from the same push and race. The health check below is what makes losing that race visible rather
than silent. **Anything destructive is applied by hand, before merging.**

## Importing the old estate

The identity import is rehearsed weekly and applied once, at cutover. Everything but the export
runs offline against dumps, and nothing in `migration/` can write to a remote database
(`migration/README.md`).

A rehearsal, which is what `bun run migration:dry-run` does after `bun run migration:export`:

1. `inventory.ts` records per-table counts and domain checksums from the dumps.
2. `transform-identity.ts` builds `out/unified.sqlite`, reusing `out/id-map.tsv` so the same person
   keeps the id they were given last week.
3. `reconcile.ts` verifies the counts and the invariants, and **exits non-zero** on any failure.
4. `load.ts` writes `out/load.sql` and, given a local path, applies it there and reports the row
   count per table.

The load upserts on identity and **never deletes**: a person or a grant that disappeared upstream
stays until somebody decides what should happen to them.

### At cutover

Applied by hand, like everything else destructive, and only after a green reconciliation:

```bash
bunx wrangler d1 time-travel info unified          # take the bookmark first
bunx wrangler d1 execute unified --remote --file=migration/out/load.sql
```

`load.sql` is plain statements with no bound parameters, so D1's parameter limits do not apply. It
is **not** one transaction: D1 executes the file statement by statement, which is why the Time
Travel bookmark is taken first and why the load is safe to run again after a partial failure.

Keep `out/id-map.tsv` until cutover is complete. After that it is the key to an estate that no
longer exists, and it goes with the archive rather than staying on anybody's laptop.

## The health check

`GET /api/health` is public and returns:

- **200** with `{ ok: true }` when the schema matches the code.
- **503** naming the pending migration files when the deploy is ahead of its schema, or when the
  session password could not be read from the Secrets Store.

A 503 naming migrations means the deploy won the race. Run the migrate workflow by hand.

## Scheduled tasks

Registered in `nuxt.config.ts` and mirrored in the wrangler cron triggers; the two lists must
agree, and `tests/unit/tasks.test.ts` fails if they drift or if a name has no handler.

**Only `daily:sweeps` does work today.** The other seven are stubs that report the story they are
waiting for, and exist so their cron trigger has something to call: a cron pointing at a missing
handler errors on every firing.

`daily:sweeps` (04:00 London) removes lapsed rate-limit windows, lapsed MFA attempts and unclaimed
sign-in tokens. Everything it touches is already spent by claim, so what it finds was never used.

## The first administrator in a new environment

Granting the administrator role needs a permission only an administrator holds, so an environment
with none cannot administer itself. This is the only way in.

**Locally:**

```bash
bun run grant-admin <email>
```

The account must already exist, so register or sign in once first. The script refuses any target
that is not a local database, and refuses to run at all with `NODE_ENV=production`.

**It also refuses when the database already has a usable administrator**, because an ordinary
grant is audited to a person and this one is not. A local fixture that genuinely needs more than
one passes `--additional`; there is no such escape hatch against a real database.

**In production**, the script cannot be used. The sequence is:

1. The IT Manager confirms with a second committee member that the environment has no usable
   administrator, and records who asked and who agreed.
2. The person who is to hold the role registers or signs in once, so the account exists.
3. The IT Manager inserts the grant and its audit entry in one statement against D1, with
   `actor_id` NULL so the trail records the bootstrap rather than a person:

   ```bash
   bunx wrangler d1 execute unified --remote --command "..."
   ```

   The grant expires at the committee year end (31 July, London) like any other.
4. That administrator grants every subsequent role through `/api/admin/roles`, which records who
   did it.

Anyone holding a privileged role must set up an authenticator app before the role works
(`/account/security`), so step 3 is not finished until they have.

## Secrets

| Name | Where | Notes |
| --- | --- | --- |
| `NUXT_SESSION_PASSWORD` | Cloudflare account Secrets Store, bound in | Shared across the estate. Rotating it signs everyone out; it is the emergency lever, not routine. Setting it as a worker secret **breaks** sealing, because a leftover secret of that name takes priority over the store binding. |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET` | worker secrets | Workspace-only sign-in. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | repository secrets | Read by the migrate workflow. Needs D1 edit. |

Everything is mirrored in the committee password manager, which is the only place a value can be
read back. The `NUXT_` prefix is load-bearing: Nuxt maps only `NUXT_*` onto `runtimeConfig`, so a
worker secret without it is silently ignored.

## Not built yet

Named here so nobody looks for them: backups and the restore drill (K-108, J-107), the retention
sweep (K-111), and the operator documentation published in-app (J-109). The stubs above are the
placeholders for the first two.
