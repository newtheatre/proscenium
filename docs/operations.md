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

**`daily:sweeps` and `training:expiry-sweep` do work today.** The other six are stubs that report
the story they are waiting for, and exist so their cron trigger has something to call: a cron
pointing at a missing handler errors on every firing.

`daily:sweeps` (04:00 London) removes lapsed rate-limit windows, lapsed MFA attempts and unclaimed
sign-in tokens. Everything it touches is already spent by claim, so what it finds was never used.

### training:expiry-sweep (06:00)

Warns members before their training lapses, digests to the leads on the first of the month, and
prunes the notification ledger. It reads training records and writes only the ledger: expiry
happens because the calendar moved, and the sweep merely notices (G-125 criterion 5).

**It ships disarmed.** With `TRAINING_SWEEP_ARMED` false it computes exactly what it would send and
returns it as `wouldSend`, claiming nothing, so arming it later still warns everybody who was due.
Arming it is a settings change and is audited like any other.

Two warnings go out per record, and they are independent: one when it enters
`TRAINING_EXPIRY_WARNING_DAYS` (60), one at `TRAINING_FINAL_WARNING_DAYS` (14). The gentle one
having gone out never suppresses the urgent one. Each is claimed once per record and window in the
ledger, so re-running the sweep, or two of them racing, sends nothing twice. Briefs are excluded
entirely: a brief never expires, and warning about one would be inventing an obligation.

Digests go on the first of the month to every department lead for their departments, and to
administrators and the training officer for everything. **They send even when there is nothing in
them**, because a month with no digest means the clockwork stopped, and that is the thing worth
noticing. Somebody who is both an officer and a lead gets the wider scope, not two emails.

The ledger is pruned at `TRAINING_LEDGER_MONTHS` (24) in every mode, armed or not.

To run it by hand, `POST /_nitro/tasks/training:expiry-sweep`. The result reports `armed`, the
counts for each window, `digests` and `pruned`.

## Recalculating a module's training expiries

A training record's expiry is stamped the day it is earned, from the module's policy as it stood
then. Changing that policy afterwards moves nothing: every record already awarded keeps the date
it has. `/admin/training-recalculation` is the only way that date ever moves, and it is
administrator-only (`training.recalculate`).

Running one:

1. Pick the module. The screen previews every record the run would restate, naming the person, the
   award date, the date standing and the date the policy would put there. It writes nothing.
2. Read the preview. It pages, so page through it rather than trusting the first page.
3. Type the affected-row count back into the box. The Restate button stays disabled until the
   number matches.
4. Press it. The count is checked again against the database inside the same write, so a run whose
   affected set moved while you were reading the preview is refused rather than half-applied.

What it refuses, or skips:

- **A count that no longer matches**: a 409 quoting the number you confirmed and the number that
  now need restating. Nothing is written. Preview again and repeat.
- **A record with an overridden expiry**: an explicit expiry set at sign-off is somebody's
  decision, not the policy's, and a run never touches it.
- **A revoked record**: it stopped counting when it was revoked and its dates are frozen.
- **A superseded record**: only the current award for a person and module is restated.
- **A record already on the policy**: it is not in the affected set at all, so running the same
  recalculation twice restates nothing the second time and is refused for a count of zero.

Every run writes one audit entry, `record.expiry.recalculated`, in the same batch as the dates it
moved. There is no partial run and no unaudited one. The entry names the module, the policy it
restated to and how many records moved; it names no person, because audit detail carries
identifiers and never people.

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
