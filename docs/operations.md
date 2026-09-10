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

### The one-handed walkthrough (K-102 criterion 4)

**Any release that changes the door, the till or the registers is walked through on a real phone
first**, by a person holding it in one hand. An emulator at 360 pixels is how the layout is
developed; it is not how this is signed off, because a thumb reaching the top of a screen is the
thing being tested and a mouse never fails that.

Hold the phone in one hand, in a room with the lights down, and use nothing but the thumb of that
hand. Any step that needs the other hand, a second finger, a long press or a squint is a defect,
recorded and fixed before the release goes out.

- [ ] Sign in and open `/tonight`. The night's screens are listed and reachable without scrolling.
- [ ] **Admit**: open the door screen, find tonight's performance, admit a ticket, and see it
      counted. Then refuse one, and read the reason back.
- [ ] **Sell**: open the till, add two sizes to the basket including one with a mixer choice,
      edit a quantity, remove a line, tap Charge, and read back the figure to key into the
      reader. Force a mismatch (change a price after the screen last asked) and see it refused,
      naming both figures, before it settles.
- [ ] **Age check**: run a challenge from the till to its decision, both ways: recorded and refused.
- [ ] Each screen's "last synced" line is present and names a plausible minute.
- [ ] Turn the network off, and each screen still shows what it last held.
- [ ] Every action tapped once did what it said the first time.

Signed off by the person who walked it, named in the release notes with the date. Until the door
(D-126) and the age check (E-118) are built, the steps naming them are skipped and recorded as
skipped rather than ticked. The till's own step walks what F-103 and F-104 built; nothing is
recorded as a sale until F-105 lands the atomic write.

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

### Applying a destructive migration by hand (K-107 criterion 3)

`check-migrations` refuses a generated rebuild outright (0010, 0052). Splitting the change so no
rebuild is needed is the default fix; where one is genuinely unavoidable, the file is
hand-corrected the way 0052's `venue_emergency_info` migration was, and applied against
production before the pull request merges, because `migrate.yml` only runs after a push to `main`
and never reviews anything first.

Run it with the same tool and the same restore point the automated job takes, by hand with
production credentials instead of by CI:

```bash
export NUXT_HUB_CLOUDFLARE_ACCOUNT_ID=... NUXT_HUB_CLOUDFLARE_API_TOKEN=... \
       NUXT_HUB_CLOUDFLARE_DATABASE_ID=02c35a27-b6dc-47b0-8d9b-7a526324aca1
bunx wrangler d1 time-travel info unified                     # take the bookmark first
NODE_ENV=production ./node_modules/.bin/nuxt-db migrate --verbose
./.github/scripts/pending-migrations.sh                       # confirm the ledger agrees
```

Merge only once the ledger confirms nothing is pending. `migrate.yml` then finds the migration
already applied on its next run and does nothing further; it is not skipped, only a no-op.

## Importing the old estate

The identity import is rehearsed weekly and applied once, at cutover. Everything but the export
runs offline against dumps, and nothing in `migration/` can write to a remote database
(`migration/README.md`).

A rehearsal, which is what `bun run migration:dry-run <target>` does after `bun run migration:export`,
against a target that already carries the real application schema (`migration/README.md`):

1. `inventory.ts` records per-table counts and domain checksums from the dumps.
2. `transform-identity.ts` builds `out/unified.sqlite`, reusing `out/id-map.tsv` so the same person
   keeps the id they were given last week.
3. `reconcile.ts` verifies the counts and the invariants, and **exits non-zero** on any failure.
4. `load.ts` writes `out/load.sql` and applies it to the target, reporting the row count per table.
5. `transform-bookings.ts` and `transform-money.ts` run against the same target, now that the
   users `room_bookings` and `ledger_entries` key to already exist there.

The load upserts on identity and **never deletes**: a person or a grant that disappeared upstream
stays until somebody decides what should happen to them.

**What a green rehearsal is actually proving.** In the 6 September 2026 export, 8,268 of 9,974
`auth.users` are already anonymised and 8,274 are disabled: about five in six of what the identity
rehearsal imports is a tombstone or a disabled account, not a live one. A rehearsal proving "an
active account with roles and a second factor carries across" is exercising roughly one row in
six; the tombstone-and-disabled path is the dominant case, not the edge case, whatever two
consecutive green runs are read to demonstrate for the Phase 2 gate (`docs/roadmap.md`).

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

### The rollback runbook (K-119)

The old estate goes read-only on 1 November and can be re-armed within a day for the rest of the
season if a cutover-blocking defect appears (0015, `roadmap.md` Phase 3). This is what re-arming
means as a checkable state, what flips and in what order, and what the one-day bound actually
rests on.

**Who decides, and what happens first.** The IT Manager declares a defect cutover-blocking and
directs the rollback; nobody else's local judgement freezes an estate. The first action is not
technical: the committee and the duty officers for the shows affected are told before any system
changes state, so nobody is mid-write on something about to move under them.

**What flips, in order:**

1. Each of the four old apps (stage-door, proscenium, rooms, rehearsal) reverses its own
   read-only toggle. That mechanism is that app's own, operated there, not specified here
   (criterion 1); this runbook only assumes it exists and is fast, because the estate's Workers
   Builds deploy in minutes, not hours.
2. The old estate resumes as authoritative: door, money, bookings and registers follow it again
   for every show still to run this season, the same "one system for a show's whole run" rule
   that governed the original cutover (0015).
3. The new system's write paths are **not** frozen by anything built today: no maintenance-mode
   toggle exists in this application. Whether a rollback needs one, so the two estates never
   accept a write for the same show at once, is a decision nobody has made; naming it here is
   the honest step, not inventing a switch that does not exist.

**What the one-day bound depends on, beyond the toggle:**

- **Reconciling what happened on the new system in the interim.** Every show that ran
  authoritatively on the new system between the week of 26 October and the rollback has bookings,
  sales and registers that exist only there; the old estate resumes from its 31 October
  frozen-export state and knows nothing of them. `migration/` only ever runs old-to-new: there is
  no reverse transform, and writing one is not a day's work. Whether that gap is closed by hand
  (duty officers re-keying a short window's activity into the reactivated old estate) or accepted
  as a recorded loss for the affected shows is a decision nobody has made; the bound is only honest
  once it is.
- **Anyone who exists only in the new system.** An account created, or a role granted, after
  cutover has no old-estate counterpart: `out/id-map.tsv` maps identities the other way and stays
  archived (`migration/README.md`), but nothing maps a new-only person back. They re-enrol on the
  old estate by the ordinary path, the same as any new starter.

**What "re-armed" means, checkably, not as a feeling:**

- A real write against each of the four old apps succeeds and is visible after a reload, not just
  that a read-only banner has gone.
- The IT Manager has told the committee and duty officers which system is authoritative for every
  show still to run, by name, not by implication.
- The interim-reconciliation decision above has been made, and acted on or explicitly deferred, for
  every show that ran on the new system since 26 October.

**The rehearsal.** Like the restore drill (K-108, J-107), this runbook is exercised once before
cutover, not left for the drawer: the IT Manager walks it end to end and records how long each
step actually took. A rehearsal that overruns the one-day bound is the finding, not something to
average away, and 0015's bound is revisited before cutover rather than after.

### The bar's opening balance (K-116)

Not a transform. A production export (6 September 2026) found no stock-movement history to
import: `stocktakes`, `stocktake_lines`, `stock_deliveries` and `stock_delivery_lines` all read
zero rows, and the four rows in `stock_movements` sum to zero quantity. There is nothing to
carry across.

At cutover, the bar manager counts physical stock into the stocktake screen bar already has
(`/bar/stock/stocktakes`, F-115) and applies it. That count **is** the opening balance: F-115's
apply route already does everything K-116 asked for beyond the transform (a blank count reads
differently from an entered zero, and a finished stocktake posts its adjustments in one atomic
batch). No second screen, and no import step precedes it.

## The health check

`GET /api/health` is public and returns:

- **200** with `{ ok: true }` when the schema matches the code.
- **503** naming the pending migration files when the deploy is ahead of its schema, or when the
  session password could not be read from the Secrets Store.

A 503 naming migrations means the deploy won the race. Run the migrate workflow by hand.

**Nothing watches it from outside on its own** (J-106 criterion 3): `.github/workflows/migrate.yml`
polls it once, with retries, right after applying migrations, and `.github/workflows/health-watch.yml`
polls it on a schedule so a Workers Builds deploy that touches no migration is still caught. Neither
can be sequenced against the other pipeline's completion; both fail the GitHub Actions run loudly
rather than passing silently. The `health:watch` task below is the third leg, for sustained
unhealthiness reaching the IT Manager rather than a CI log.

## Changing a published rule

Every number on a policy page is read from the settings surface as the page loads (0012, J-110), so
changing a rule is a settings change at `/admin/settings` and nothing else: no content edit, no
release, no deploy. The page shows the new value on its next load.

Three things worth knowing before doing it:

- **A rule the system does not enforce says so on the page.** A setting nothing in the server reads
  is marked "not enforced yet" beside its value, so publishing a rule the code does not apply is
  visible to the reader rather than a quiet lie.
- **A setting that holds personal data can never be quoted.** CI refuses a token naming one, and
  the endpoint that answers the page refuses the key, so neither a preview nor a deploy publishes
  committee addresses.
- **The prose is a content edit and a deploy.** The sentences around the numbers live in
  `content/policies/*.md` in the repository, so changing the wording is a pull request, while
  changing the number is not. That split is deliberate (0012).

## Scheduled tasks

Registered in `nuxt.config.ts` and mirrored in the wrangler cron triggers; the two lists must
agree, and `tests/unit/tasks.test.ts` fails if they drift or if a name has no handler.

**`daily:sweeps`, `training:expiry-sweep`, `shifts:escalate`, `rooms:sweep`, `rooms:remind`,
`shifts:remind`, `backup`, `health:watch`, `holds:release` and `retention:sweep` do work today.**
The other two (`sessions:sweep`, `nights:close`) are stubs that report the story they are waiting
for, and exist so their cron trigger has something to call: a cron pointing at a missing handler
errors on every firing.

### health:watch (every 10 minutes)

Runs the same check `/api/health` answers. The first unhealthy result opens a `health_incidents`
row; a check that recovers closes it, so the next failure alerts again from cold rather than a
single old notification silencing every future one. While one stays open past
`HEALTH_ALERT_WINDOW_MINUTES` (30), the IT Manager (every live `ADMIN` grant) is told once through
the notification centre, claimed exactly like any other send (0048): a run that finds the window
already passed and the claim already taken sends nothing further. A deploy and its migration job
can legitimately race for a few minutes, which is why this waits out a window instead of alerting
on the first failed check (J-106 criterion 5).

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

### Role lapses, inside daily:sweeps (04:00)

Committee roles run to the end of the theatre's year, 31 July London, and expire at read time: a
lapsed grant grants nothing from the instant it expires, whether or not any sweep has run (0009).
What A-119 adds is notice, visibility and tidying, none of which change who holds what.

**The holder is warned once per grant and date**, `ROLE_LAPSE_NOTICE_DAYS` (14) before it lapses.
Somebody holding four roles that lapse on the same day gets one message naming all four, not four
messages. The claim carries the grant and its expiry, so changing an expiry re-arms the warning
rather than finding the notice already spent. An unverified or anonymised holder is skipped rather
than claimed for: a claim taken for a message the notification centre then refuses would be that
account's whole notice, gone silently.

The message says plainly that this is the standing role and nothing else. A shift somebody is
confirmed for still opens the screens it always did, because authority on the night derives from
tonight's facts rather than from a grant (0009).

**Administrators are digested monthly, on the first**, with what is lapsing, what lapsed recently
and every permanent grant. The standing report of permanent grants is the point of the digest as
much as the lapses are: a grant with no expiry is an exception, and an exception nobody sees
becomes the rule. The digest sends whether or not it has anything in it, for the same reason the
training one does. A lapsed grant stays in the digest for exactly as long as its row survives the
prune below, so the two windows are ends of the same one.

**Grants lapsed longer ago than `ROLE_GRANT_PRUNE_DAYS` (90) are deleted**, and each deletion is
trailed as `role.pruned` with no actor. This is housekeeping: the row had granted nothing since it
expired, and the trail keeps what it said. To run the whole nightly sweep by hand,
`POST /_nitro/tasks/daily:sweeps`; its `roleLapses` result reports `warned`, `holders`, `digests`,
`pruned` and the `standing` counts the digest would carry.

### retention:sweep (04:00 on the 1st)

Warns accounts approaching their inactivity threshold, anonymises the ones past it and digests the
IT Manager. It reuses A-125's erasure engine for the write, so an automated anonymisation is the
same code path as a hand-run one, attributed to system (A-126 criteria 5, 6).

**It ships disarmed.** With `RETENTION_ARMED` false it computes what it would do, reports
`wouldAnonymise` and claims nothing, so arming it later still warns everybody who was due. Arming
is refused until a dry-run digest has actually sent (J-105 criterion 4), which is why the digest
emails for real in dry-run rather than merely reporting that it would.

Two warnings go out per account, and they are independent: one at `RETENTION_WARNING_DAYS` before
the threshold, one at `RETENTION_FINAL_WARNING_DAYS`. Both keys ship unset, so **the sweep refuses
to run until the IT Manager sets a cadence** (0019). Each warning is claimed once per account and
window, keyed on the last sign-in, so a fresh sign-in restarts the clock and a later dormant spell
warns again.

**An unverified address and an unclaimed guest are never warned**, only anonymised on their own
clock: a guest never asked for an account, and a warning to an unproven address is a message 0026
forbids. Full accounts anonymise at `RETENTION_FULL_ACCOUNT_YEARS` (2) of inactivity, guests at
`RETENTION_GUEST_YEARS` (3). Current members, live role holders (administrators included) and
anyone owing on an unsettled tab are exempt, recomputed every run rather than recorded.

Each run is capped twice: `RETENTION_WARNING_CAP` (100) warnings and `RETENTION_SWEEP_CAP` (200)
anonymisations. A cap refuses the surplus rather than queuing it, so the next run finds the same
accounts still due and takes the next slice; the digest names the cap it hit.

To run it by hand, `POST /_nitro/tasks/retention:sweep`. The result reports `armed`, the counts for
each window, `warningsCappedAt`, `anonymisationsCappedAt`, `wouldAnonymise` and `digests`.

### backup (05:00 Monday) and the restore drill (K-108, J-107)

Point-in-time restore is D1 Time Travel, already automatic and already used by the migrate
workflow; nothing here changes that. What `backup` adds is a **weekly export independent of D1**:
a row count per table and the ledger's total pence, written as JSON to the `BLOB` binding (R2) at
`backups/<date>.json`. It is a reconciliation manifest, not a copy of the data itself, deliberately:
a second copy of personal data sitting outside D1's erasure path is not something this task takes
on quietly, and row counts and money totals are exactly what the drill below reconciles against.

**A failed export audits `backup.export-failed` with the error message**, actor `NULL`, so it
reaches the trail rather than only a cron log nobody reads. To run it by hand,
`POST /_nitro/tasks/backup`.

**The restore drill itself is a manual exercise**, run by the IT Manager: restore a Time Travel
bookmark into a scratch D1 database and reconcile its row counts and ledger total against the
manifest for that week (or against production directly). Record the outcome at `/admin/backups`
(`backups.write`): the date, the outcome, minutes to restore, and whether row counts and money
totals reconciled. A failed drill is still recorded, not omitted; the finding is the point of it.

The same screen (`backups.read`) shows the last drill that **passed** and flags it overdue once
`BACKUP_DRILL_INTERVAL_DAYS` (proposed 120, `docs/workshops.md`) has elapsed since. A drill that
failed does not clear the flag: it is not evidence the backup restores. No drill ever recorded
reads as overdue from the first deploy, which is what puts the first one before the December break
without a separate rule for it (K-108 criterion 4).

## Calling a session off, and correcting one that ran

**Before the register opens**, a session is cancelled from its page in the console. The reason is
mandatory and is emailed to everybody signed up, whether they held a place or were waiting, so
write it for them. The email is transactional: somebody who has turned training email off still
gets it, because the alternative is a locked door. A cancelled session awards nothing and its
register can never be opened.

**Once the register is open** the session happened, whatever went wrong on the night, so it cannot
be cancelled. Correcting it is the edit window instead.

**For 14 days after the day it was held** (`SESSION_EDIT_WINDOW_DAYS`), a marked register can be
corrected from the register screen: **Correct it** brings the marks back as they were left. What
was awarded before is revoked with a reason and the corrected set is issued in its place, in one
write. Anybody dropped keeps their absence on the register as evidence and is emailed the same
"sorry we missed you" note they would have had on the night.

Past that window the screen says so, and the only correction left is an administrator revoking the
record and granting it again.

## Logging training that was delivered off-system

Teaching that happened without a scheduled session still ends in records.
`/training/manage/sessions` is where a trainer logs it, under **Log a session**, and it needs a
current trainer certification rather than a role (the training officer may use it on a trainer's
behalf). Scheduling a session and logging one that already happened are the same job at two ends of
the same day, so they share one screen.

Logging one:

1. Press **Log a session**, then name the day it was taught, what was taught, and everybody who was
   there. The day cannot be in
   the future, and you may name only modules you currently hold.
2. Press **Show me what this creates**. The dry-run lists every record the log would write, one
   line per person per module, with the expiry each would carry. It writes nothing, and changing
   anything on the form puts it back so the preview always matches what would happen.
3. Clear whatever it reports. A missing prerequisite for a **safety-critical** module stops the log
   outright: teach or sign off the prerequisite first, there is no way to wave it through. A
   missing prerequisite for an ordinary module shows a tick box per gap, and each has to be ticked.
4. Press **Log it**. Every record lands in one batch, dated to the day it was taught.

What it refuses:

- **A day in the future**: an award dated ahead would read as valid at every gate until then.
- **A retired, draft or sign-off-only module**, and any module you do not hold yourself.
- **A safety-critical prerequisite gap**, absolutely.
- **An unacknowledged ordinary gap**, naming what is missing.
- **A count that no longer matches the dry-run**: a 409 quoting both figures. Logging the same
  evening twice hits this, because the second attempt would create nothing.

Somebody who has never signed in is added under **By address**. They get an account with no
password, which they claim by registering or signing in with that same address later; the training
is already waiting on it. An address whose account has been erased is refused, because a record
cannot be attached to a tombstone.

Records already dated to that day for the same person and module are shown as already recorded and
are not written again. Correction is revocation with a reason and then a fresh log; nothing here
edits a record, because the table is append-only. Every attendee gets one `record.delivery-logged`
audit entry naming the day and the modules, and no person is named in the detail.

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
| `NUXT_BACKSTAGE_BOARD_SECRET` | worker secret | HMAC key material for the backstage board's join code (E-120). Never read outside this app; rotating it invalidates every code and every joined device in one step. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | repository secrets | Read by the migrate workflow. Needs D1 edit. |

Everything is mirrored in the committee password manager, which is the only place a value can be
read back. The `NUXT_` prefix is load-bearing: Nuxt maps only `NUXT_*` onto `runtimeConfig`, so a
worker secret without it is silently ignored.

## Seeding a development database

`bun run seed [database]` fills a local database, defaulting to `.data/db/sqlite.db`. It refuses
any target that is not `:memory:`, under `.data/` or under `/tmp/`, refuses `NODE_ENV=production`,
and has no flag to override either (K-120). It prints every credential it generated once: account
passwords, backstage board join tokens and calendar feed tokens. None is stored anywhere it can be
read back, and none is committed.

It is re-runnable. Rows are matched on their natural key, so a database an earlier seed or an
earlier version of the seed wrote is adopted rather than duplicated, and the only thing a second
run changes is the password it prints.

The builders live in `scripts/seed/`, one module per domain, and each returns a list of statements
rather than writing anything itself. That is what lets the same builders back the test fixtures in
`tests/helpers/`. Three things it deliberately does not seed:

| Not seeded | Why |
| --- | --- |
| `totp_secrets`, `recovery_codes`, `passkeys`, `passkey_challenges`, `auth_tokens` | Credential material. A committed secret in a fixture is still a committed secret, and a passkey needs a real authenticator. Enrol a second factor through `/account` instead. |
| `rate_limits`, `mfa_attempts` | Transient counters the runtime writes. Seeding them fakes throttling state a developer then has to wait out. |
| `module_materials` | Every row would be a URL nobody has supplied. `data/catalogue.csv` carries none, and inventing them would put fiction on a training page. |

`/dev` seeds the persona accounts and nothing else. The rest of the seed cannot run from there:
its builders read as they write, and D1 inside a worker is asynchronous, so the synchronous
natural-key lookup that makes a builder re-runnable is not available. Both doors read the same
`shared/utils/personas.ts` registry and write the same `personas.json` map, so they agree
whichever runs first.

## Not built yet

Named here so nobody looks for it: the operator documentation published in-app (J-109), which is
where the restore drill procedure belongs once it exists (J-107 criterion 5). The retention sweep
is built and documented above; what it still waits on is a warning cadence and, in December, an
arming (A-126, K-111).
