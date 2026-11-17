# 5. Screens

## Six console screens and Setup

Foundations' screens are for the people who run the system, not for audiences or ordinary members. Setup is a page of its own at `/setup`. The other six live in Site administration, the fourth shell, at addresses under `/admin` (Matt's decision of 16 November 2026 and integration's ruling R-33, which replaces R-31). Site administration holds the screens that are about the installation and not about a night's work: email sending, vocabularies, modules, branding, updates, audit and health. The console's System group is gone, and each old address under `/console/system` redirects to its new one. The module id remains `core`. Layout, components and wording style follow workstream 6; this part says what each screen is for, what is on it and what it must never do.

**Where they sit in Site administration (agreed with the interface, 16 November 2026).** The shell has no ability of its own: a person sees it when they hold the ability of at least one entry in the `admin` menu, sees only those entries, and otherwise gets page not found at `/admin`. It has six groups in a fixed order, declared by core: Theatre, Modules and settings, Access, Email, Connections, Upkeep. Foundations' screens are Modules and Settings in *Modules and settings*, Credentials in *Connections*, and Jobs, Health, Audit log and Updates in *Upkeep*. Updates has its own address, `/admin/updates`, because it carries the Apply button and is one of the three routes that still answer while migrations are pending (rule G1); the card on the shell's Overview page links to it. The other screens in the shell belong to identity, the core domain and the interface, and the Interface Doc lists every address.

| Screen | Address | Who (default) | Purpose |
| --- | --- | --- | --- |
| Setup | `/setup` | Whoever holds the setup code, then the Owner | Take a fresh deploy to a usable site |
| Modules | `/admin/modules` | Owner; administrator to view | See what the system can do and switch parts on or off |
| Settings | `/admin/settings` | Owner, administrator; managers for their own module's settings | Change how the theatre works, with limits and history |
| Jobs | `/admin/jobs` | Owner, administrator | See background work, retry or cancel it |
| Credentials | `/admin/credentials` | Owner; administrator to view | Enter and replace keys for outside services |
| Updates and health | `/admin/updates and /admin/health` | Owner; administrator to view | Know whether the system is well and up to date |
| Audit | `/admin/audit` | Owner, administrator | Answer who did what, when and why they could |

The roles named are identity's preset roles; part 6 gives the abilities.

## Setup

Shown only while the system has no Owner. The first deploy prints nothing secret in logs: the setup code is the Worker secret `CORE_SETUP_CODE`, set by the person who deployed. Without it the page explains where to set it and does nothing else.

This is the one statement of the setup sequence. Foundations owns the order and the setup code; the interface draws it; identity and the core domain supply the steps named as theirs.

1. **Check.** Database reachable, migrations pending (count), file store, queues, cron and encryption key present. Each line is a health check with a remedy. Cannot continue while a required one fails.
2. **Prepare the database.** One button applies all migrations, with progress per migration.
3. **Create the Owner.** Identity's step, and identity's rules: name, email address, a passkey, and recovery codes typed back to prove they were saved. It writes the first grant.
4. **The theatre.** Name, time zone, currency, language (`core.site.name` and `core.locale.*`). The time zone has no default and must be chosen. Everything else has a default.
5. **Choose a starting point.** One of the three presets, `student-society`, `amateur-company` or `small-venue`, or Start empty. A preset switches on a set of modules and applies settings, and lists exactly what it will switch on and change before it is applied. There is no sample data.
6. **Checklist.** The remaining setup steps contributed through `core.setup-step`, each with a link (to an /admin address where the step is about the installation), shown on the console home until all are done or dismissed. The core domain's are the look (brand colour and logo), the first venue, the year end, the sender address and the email outcomes subscription; each switched-on module adds its own.

Where the interface's Steps page allows five steps, Check and Prepare the database share the first.

Setup can be left and resumed at any step. Once an Owner exists `/setup` answers page not found for ever, and the setup code is no longer read.

## Modules

A card for each module: name, one sentence on what it does, stability (experimental, stable or deprecated), on or off, and what it needs. Grouped as Always on, On, Available, and Your theatre's own (`x-` modules).

- Switching on shows a confirmation that lists: modules it will also switch on, secrets it needs and whether they are set, presets on offer, and the screens that will appear.
- Switching off shows: what will disappear, what will be kept (always the data), which modules prevent it if any, and the counted statements the module itself gives of what the switch will cost (its switchOff.impact).
- A module that is on but missing something it needs shows a warning with a link to the remedy.
- Experimental modules carry a plain statement that their data format may change before they are stable.

## Settings

One page per module, generated from the settings registry and found at /console/\<module>/settings in that module's own group; /admin/settings is the index and the search across all of them, and the place where every setting declared scope: 'site' is shown and changed; no module writes its own settings screen unless a setting's kind is `custom`.

**Superseded in part on 16 November 2026 (Matt, the settings redesign).** There is no `/admin/settings` and no core settings page. Settings are drawn by page, not by module: each group of settings is placed on one generated page or one bespoke screen through the manifest's `settingGroups` and `settingPages` (Settings registry tab, "groups and pages"). Foundations' own groups go to `/admin/advanced` (units, jobs, external, idempotency, rate-limits, retention, files and the delivery group) and to the Theatre page (site, locale). Two screens are added under Upkeep: Advanced, with a warning at its head, and Settings history (`/admin/settings-history`, with Revert). `/admin/settings` and `/console/system/settings` redirect. The Interface Doc holds the page convention.

- Each setting shows its label, a sentence of help, its current value, its default, its limits, and when and by whom it was last changed.
- Search across all settings by label, help text or key.
- A changed value is validated against its limits before save; the refusal names the limit.
- Settings `declared onChange: 'reason' ask for a reason; settings declared onC``hange: 'confirm'` show what will be affected first.
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

**Health.** Every health check with a state (ok, warning, failing), a sentence and a remedy. Foundations' own checks: migrations pending, cron last fired, queue consumers alive, dead jobs, external calls unknown, secrets missing, credentials expiring within 30 days, signing keys due for rotation (with Retire now, which needs core.signing-key.retire and says what it will invalidate), settings outside limits or orphaned, files in upstream's paths changed, storage and database size against the plan's limits. A warning or failure that lasts more than a day is sent to the Owner once, through notifications.

**Updates.** The version running, the release channel, the latest release on that channel, and for each release in between: its notes, whether it has migrations, whether it is marked breaking, and what the theatre must do. A button opens the update pull request in the theatre's repository when one is waiting. After a deploy with pending migrations, this is the screen with the Apply button and per-migration progress. The app never changes the repository or deploys itself.

## Audit

- Search by person, record, module, action, ability and date. Results show who, what, which record (as a link), when, and what allowed it.
- Opening a row shows the fields that changed, without personal free text.
- Every search and every export of the audit is itself audited.
- Export as a file needs `core.audit.export`, a privileged ability.
- The log cannot be edited or deleted from any screen.

## States every screen must handle

Empty (with what to do first), loading, refused (the standard refusal with its remedy), partly unavailable (a module off, a secret missing) and stale (the page reloads its data when a change is announced on the live channel). Each screen is usable by keyboard alone and on a phone; tables collapse to cards below the interface's laptop breakpoint (1024 pixels).
