# 5. Screens

## Seven screens, all in the console

Foundations' screens are for the people who run the system, not for audiences or ordinary members. All but Setup live in the console shell under a group called System. Layout, components and wording style follow workstream 6; this part says what each screen is for, what is on it and what it must never do.

| Screen | Address | Who (default) | Purpose |
| --- | --- | --- | --- |
| Setup | `/setup` | Whoever holds the setup code, then the Owner | Take a fresh deploy to a usable site |
| Modules | `/console/system/modules` | Owner | See what the system can do and switch parts on or off |
| Settings | `/console/system/settings` | Owner; managers for their own module's settings | Change how the theatre works, with limits and history |
| Jobs | `/console/system/jobs` | Owner | See background work, retry or cancel it |
| Credentials | `/console/system/credentials` | Owner | Enter and replace keys for outside services |
| Updates and health | `/console/system/health` | Owner | Know whether the system is well and up to date |
| Audit | `/console/system/audit` | Owner; data-protection lead | Answer who did what, when and why they could |

## Setup

Shown only while the system has no Owner. The first deploy prints nothing secret in logs: the setup code is the Worker secret `CORE_SETUP_CODE`, set by the person who deployed. Without it the page explains where to set it and does nothing else.

1. **Check.** Database reachable, migrations pending (count), file store, queue, cron and encryption key present. Each line is a health check with a remedy. Cannot continue while a required one fails.
2. **Prepare the database.** One button applies all migrations, with progress per migration.
3. **Create the Owner.** Name, email, sign-in method (from identity).
4. **The theatre.** Name, time zone, currency, language. Everything else has a default.
5. **Choose a starting point.** A preset (for example a student theatre, a receiving house, a society with no building) switches on a set of modules and applies settings. Each preset lists exactly what it will switch on and change. Start empty is always offered.
6. **Checklist.** The remaining setup steps contributed by modules (`core.setup-step`), each with a link, shown on the console home until all are done or dismissed.

Setup can be left and resumed at any step. Once an Owner exists `/setup` answers 404 for ever, and the setup code is no longer read.

## Modules

A card for each module: name, one sentence on what it does, stability (stable, beta, experimental), on or off, and what it needs. Grouped as Always on, On, Available, and Your theatre's own (`x-` modules).

- Switching on shows a confirmation that lists: modules it will also switch on, secrets it needs and whether they are set, presets on offer, and the screens that will appear.
- Switching off shows: what will disappear, what will be kept (always the data), and which modules prevent it if any.
- A module that is on but missing something it needs shows a warning with a link to the remedy.
- Experimental modules carry a plain statement that their data format may change before they are stable.

## Settings

One page per module, generated from the settings registry; no module writes its own settings screen unless a setting's kind is `custom`.

- Each setting shows its label, a sentence of help, its current value, its default, its limits, and when and by whom it was last changed.
- Search across all settings by label, help text or key.
- A changed value is validated against its limits before save; the refusal names the limit.
- Settings marked `change: 'reason'` ask for a reason; settings marked `change: 'confirm'` show what will be affected first.
- History for any setting: every change with who, when, old and new value (sensitive values shown only as changed).
- A setting managed by the deployment (`managed`) is shown read-only with a note that it is set outside the app.
- A filter for Changed from default, so a successor can see at a glance what this theatre has decided.
- Export of all non-sensitive values as a file, and import with a preview of differences, so a theatre can copy its conventions to a test site.

## Jobs

- Counts by state and lane, then a list filtered by state, module and name.
- A job's page: its name in plain words, what it concerns (through the record resolver), attempts with times and errors, and Retry or Cancel where allowed.
- Dead jobs first. Retry all of one kind is offered when the same error repeats.
- Scheduled tasks: each task, when it last ran, how long it took, when it is next due, and Run now.
- External calls whose outcome is unknown, with what the reconcile task last found.
- Payloads are shown as record links, never as raw data.

## Credentials

- A row for each secret and credential a switched-on module declares: what it is for, whether it is set, where it is set (deployment secret or stored here), when it was last used, when it expires.
- A stored credential can be entered or replaced, never read back; only its last four characters show.
- A deployment secret shows the exact name to set and a link to instructions; the app cannot set it.
- Test, where the module provides a test call, reports success or the provider's error.

## Updates and health

One page, two halves.

**Health.** Every health check with a state (ok, warning, failing), a sentence and a remedy. Foundations' own checks: migrations pending, cron last fired, queue consumers alive, dead jobs, external calls unknown, secrets missing, credentials expiring within 30 days, settings outside limits or orphaned, files in upstream's paths changed, storage and database size against the plan's limits. A warning or failure that lasts more than a day is sent to the Owner once, through notifications.

**Updates.** The version running, the release channel, the latest release on that channel, and for each release in between: its notes, whether it has migrations, whether it is marked breaking, and what the theatre must do. A button opens the update pull request in the theatre's repository when one is waiting. After a deploy with pending migrations, this is the screen with the Apply button and per-migration progress. The app never changes the repository or deploys itself.

## Audit

- Search by person, record, module, action, ability and date. Results show who, what, which record (as a link), when, and what allowed it.
- Opening a row shows the fields that changed, without personal free text.
- Every search and every export of the audit is itself audited.
- Export as a file needs `core.audit.export`, risk high.
- The log cannot be edited or deleted from any screen.

## States every screen must handle

Empty (with what to do first), loading, refused (the standard refusal with its remedy), partly unavailable (a module off, a secret missing) and stale (the page reloads its data when a change is announced on the live channel). Each screen is usable by keyboard alone and on a phone; tables collapse to cards below the narrow breakpoint defined by workstream 6.
