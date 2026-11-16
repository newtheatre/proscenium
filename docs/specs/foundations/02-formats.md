# Formats: draft for alignment

A module declares everything about itself in one file, `layers/<id>/module.ts`, and nothing about a module is registered anywhere else. This tab is the one-page version; the sub-tabs give each format field by field, and the last sub-tab is a whole module to copy from.

**Status: draft 1, 16 November 2026.** The field names and naming rules are stable enough to write against. The three proofs may change how the build collects manifests, but not what a module declares. Changes after this draft are listed at the foot of this tab.

## What each workstream writes in these formats

| Part of your specification | Write it as | Format |
| --- | --- | --- |
| 2. Data model | One table per database table, in the column layout on the Data-class registry sub-tab | Data-class registry |
| 4. Interface to other modules | Services, events, points and jobs, named by the rules below | Module manifest |
| 5. Screens | Navigation entries and setup steps | Module manifest |
| 6. Settings and abilities | One row per setting and per ability, using the entry fields | Settings registry, Abilities registry |
| 8. Test plan | Named cases, filed under the tier that runs them | CI and test harness (Design tab) |

## What a module declares

| Section of the manifest | Declares | Read by |
| --- | --- | --- |
| `id`, `requires`, `uses`, `stability` | Identity and dependencies | Module switches, the import lint rule |
| `settings` | Every operational number, deadline and toggle | Settings screens, content tokens, presets |
| `abilities`, `facts`, `records` | What can be permitted, what derives authority, what a permission can be scoped to | Permission screens, the route guard, the audit log |
| `tables` | Its tables, with each column's data class and erasure behaviour | Migrations, erasure, exports, the privacy record |
| `events`, `jobs`, `tasks` | Events it announces and listens for, background jobs, scheduled tasks | The Worker entry, the outbox |
| `points`, `contributes` | Extension points it offers, and what it adds to other modules' points | Providers, navigation, setup, anything pluggable |
| `secrets` | Worker secrets it needs | The start-up check, the health screen |
| `presets` | Its defaults for each theatre type | First-run setup |

A manifest is pure data. It imports only the kit, Zod and its own declaration files, so the build, the lint rules and the documentation generator can all read it without starting the app.

## Naming rules

Every name starts with the module's id, so two modules can never collide and a name says who owns it.

| Thing | Pattern | Example |
| --- | --- | --- |
| Module id | kebab-case; a theatre's own module starts `x-` | `box-office`, `x-panto-raffle` |
| Table | module id in snake\_case, then a plural noun | `box_office_orders` |
| Column | snake\_case in SQL, camelCase in TypeScript | `created_at`, `createdAt` |
| Setting key | `<module>.<group>.<name>`, three kebab-case segments | `box-office.holds.release-before` |
| Ability | `<module>.<record>.<verb>` | `box-office.order.refund` |
| Fact | `<module>.<name>` | `front-of-house.on-shift` |
| Record type | `<module>.<noun>`, singular | `core.performance` |
| Event | `<module>.<record>.<past participle>` | `box-office.order.paid` |
| Job | `<module>.<verb>-<noun>` | `communications.send-email` |
| Scheduled task | `<module>.<verb>-<noun>` | `box-office.sweep-holds` |
| Point | `<module>.<noun>` | `payments.provider` |
| Service | A named export of `layers/<id>/server/services.ts` | `import { postEntries } from '#modules/finance'` |
| API route | `/api/<module>/...` | `/api/box-office/orders` |
| Translation key | `<module>.<area>.<name>` | `box-office.desk.take-payment` |
| Secret | `<MODULE>_<NAME>` in capitals | `PAYMENTS_STRIPE_SECRET_KEY` |

The core's id is `core`. Labels and help text are never written in a manifest: they are translation keys derived from the name (`box-office.settings.holds.release-before.label`), and a check fails the build when one is missing.

## How modules talk to each other

Four mechanisms, and no others. A module never reads or writes another module's tables.

| Mechanism | Use it when | Coupling |
| --- | --- | --- |
| **Service** | You need an answer or a write now, in the same unit of work | Hard: the provider must be in `requires` |
| **Event** | Something happened and others may care, later | None: the announcer does not know its listeners |
| **Point** | Several modules may supply the same kind of thing (a payment provider, a menu entry, an eligibility rule) | Soft: works with zero contributors |
| **Fact** | Authority should follow from a record (tonight's shift, a current training record) | Soft: a theatre maps abilities to it |

A write is a unit of work: the caller collects statements from its own code and from the services it calls, then commits them as one D1 batch. A service that writes adds statements to the caller's unit of work and never commits on its own. The audit entry and any event ride in the same batch. The detail is in part 4.

## What the build checks

`bun run check` fails when:

- a table or column has no data class, or a table's name lacks its module's prefix;
- a setting, ability, event, job or point name breaks its pattern or is declared twice;
- a content page quotes a setting that does not exist or is not marked quotable;
- a server route has no declaration of its ability and rate limit;
- a module imports from a module it does not list in `requires` or `uses`, or the core imports from any module;
- a label or help translation key is missing in British English;
- a module with something in `requires` could be switched on without it.

## Where this draft departs from the paper

For the integrating thread. Each is argued in the sub-tab named.

| Paper says | This draft says | Why | Sub-tab |
| --- | --- | --- | --- |
| A module has a version | No per-module version; the platform has one version, and a manifest records `since` | Modules ship together in one repository, so a second number can only disagree | Module manifest |
| Dependencies | Two kinds: `requires` (hard) and `uses` (soft) | Front of house asks Training about eligibility but must run without it | Module manifest |
| "Payments needs Box office or Bar" | Box office and Bar each require Payments; no either-or dependencies | An either-or rule complicates switching for no gain | Module manifest |
| Scheduled tasks and queue consumers per module | One cron trigger and one queue for the whole Worker; modules declare tasks and jobs inside them | Deploy configuration stays fixed whatever modules exist, and schedules can follow the theatre's time zone | Module manifest |
| Migrations inside each module | One migration journal per owner: upstream's, and the theatre's in `site/` | Tables reference each other across modules, so order must be global | Data-class registry |
| Three sources of authority | Unchanged, but a derived fact is declared like a role a theatre maps abilities to | One permission screen covers both | Abilities registry |
| (not in the paper) | A registry of record types | Record-scoped permissions, audit targets, files and custom fields all need to name a kind of record | Abilities registry |

## Still open

- Whether a setting may be overridden for one venue or one production. Draft 1 says no: settings are site-wide. See Questions for Matt.
- The list of shells that navigation entries name. Workstream 6 owns it; the manifest takes whatever it decides.
- The preset role names that presets map abilities to. Workstream 2 owns them.

## Changes since draft 1

Rulings made on 16 November 2026 in answer to the other workstreams. Each is binding now; the sub-tabs are being brought into line.

| Change | Asked by | Where |
| --- | --- | --- |
| There is one always-on module, `core`. Identity, the core domain and the interface are areas inside it, named by the second segment (`core.account.*`, `core.interface.*`) | 2, 6 | Module manifest |
| New manifest field `switchable: false` for a module that has its own layer and id but cannot be switched off. `forms` is the first | 5 | Module manifest |
| A module may publish components: those in `app/components/public/` may be used by modules that list it in `requires`. Every component name starts with the module id in PascalCase | 5 | Module manifest |
| Data class `per-row` (`col.perRow`) and the point `core.privacy-record` | 5 | Data-class registry |
| A service that writes adds statements to the caller's unit of work and never commits. This is the general rule for every cross-module write, not an exception | 5, integration | Part 4 |
| Ability entry gains `assurance` (`basic` or `strong`), `fresh` (a duration or false) and `grantAt` (the levels a grant may be made at). `risk: 'privileged'` defaults to strong and fresh | 2 | Abilities registry |
| Fact entry gains `standing` (holding it puts a person on the members' side). A fact resolver is an async pure read, safe to await inside a route, never queued | 2 | Abilities registry |
| `col.account(name, { role, onMerge })` for any column that refers to an account. `role` is `subject` or `actor`; `onMerge` is `move`, `alias` or `handler`. Append-only tables must use `alias` | 2 | Data-class registry |
| Foundations specifies the audit service and its table `core_audit`. The unit of work has `audit({...})` | 2 | Parts 2 and 4 |
| Shells for a navigation entry are `account`, `members`, `console` and `live`. Reserved address prefixes: `/account`, `/members`, `/console`, `/live`, `/book`, `/sign-in`, `/setup`, `/api` and anything starting with an underscore. A check refuses a theatre page under one | 6 | Module manifest |
| Navigation entry gains optional `group`, `section`, `count` and `match`. `ability` takes one ability or a list meaning any of them, never a fact name | 6 | Module manifest |
| A check that every page under a shell prefix is matched by a navigation entry | 6 | CI and test harness |
| `defineRoute({ idempotent: true })`: the route requires an `Idempotency-Key` header and replays the stored response for a repeated key | 6 | Part 4 |
| One refusal body for every route: `{ code, reason, remedy?, fields? }` | 6 | Part 4 |
| Jobs run in two lanes, `prompt` and `bulk`, so an import or a report can never delay a ticket email | integration | Module manifest |
| A `uses` link never throws when the other module is off: its point or fact simply has no contributors | integration | Module manifest |

## Rulings since draft 2

Each of these was asked for by a workstream and ruled on after the change log above. Where a format tab has not yet been reworded, this table prevails.

| Ruling | Asked by | Format affected |
| --- | --- | --- |
| A table's realm may differ by row: `realm: { column: 'realm' }` | Core domain (3) | Data-class registry |
| A per-row class may come from a parent row: `classFrom: { via: 'file_id', column: 'class' }` | Core domain (3) | Data-class registry |
| Setting kind `colour`, validated as a colour and checked for contrast where the setting says what it sits on | Core domain (3), interface (6) | Settings registry |
| Tasks may run weekly: `weeklyOn: { day, at }` beside `every` and `dailyAt` | Core domain (3) | Module manifest |
| Nuxt Content's `_content_*` tables are outside the registry and the migration runner | Core domain (3) | Data-class registry |
| `/files` is a reserved address prefix | Core domain (3) | Module manifest |
| A manifest has a `credentials` section for keys entered in the console and stored encrypted, beside `secrets` for deployment secrets | Box office (4) | Module manifest |
| `externalCall({ attempt, call, outcome })` is the one self-committing exception to the unit of work | Box office (4) | The kit |
| An append-only table may have erasable columns; the trigger permits exactly the erasure update and nothing else | Box office (4) | Data-class registry |
| A table's subject may be a person with no account: `subject: { email: 'contact_email' }`, declared with `col.email` (stored trimmed and lower-cased). A subject is an account or an email, never both. Rows holding money, a ticket or a booking key to an account, which may be unclaimed. | Box office (4), identity (2) | Data-class registry |
| Account erasure and download also sweep email-subject rows for every address verified on the account | Identity (2) | Data-class registry |
| Audit rows carry `allowed_by` (the grant or fact that passed the check) and there is a `read` action kind, declared on an ability with `audit: 'read'` | Identity (2) | Abilities registry |
| `defineRoute` gains `protect: 'turnstile'`; one secret and one verification service, both core's | Identity (2), integration | The kit |
| Rate-limit classes are `default`, `write`, `sign-in`, `public-form`, `export` | Identity (2) | The kit |
| No declarative refusal beyond `owner: 'refuses'`. Roles, facts and ownership only allow; any other lockout is a guard in the module's own service. | Forms (5), identity (2) | Abilities registry |
| The theatre's paths are `site/app/...`, `site/server/...`, `site/content/...` and `site/layers/x-*/`, because `site/` is the Nuxt project (proof 1) | Foundations | All path examples |
| A soft dependency (`uses`) never calls the other module's services: only points, events and facts | Integration | Module manifest |
| Event listeners run in the prompt lane; two lanes, each with a dead-letter queue | Integration | Module manifest |
| Site migrations are applied after upstream's, each with its own journal | Integration | Data-class registry |

## Rulings of 16 November, after Matt's comments on the core domain document

| Ruling | Asked by | Format affected |
| --- | --- | --- |
| **Events and webhooks.** Matt put outgoing webhooks in the first release, owned by core (`core_webhooks`, `core_webhook_deliveries`). Every announced event is deliverable to a webhook by default. A module keeps one off webhooks by declaring it `internal: true` in `events.announces`. An internal event still reaches listeners inside the system; it is never offered in the webhook screen and never delivered outside. | Integration, core domain (3) | Module manifest |
| **What a webhook carries.** The event's name, its time, its ids and the record's public title, and nothing else. This rests on the existing rule, now restated as binding: an event payload holds ids and public or internal values only, never a name, an address, free text or any column classed personal, freeText or special. The conformance check that already rejects such values in payloads is what makes webhooks safe. | Integration | Module manifest, data-class registry |
| **When to mark an event internal.** When the mere fact that it happened, with its ids, should not leave the system: anything about a person's standing, welfare, access needs, sign-in, an erasure or data request, or a credential. Core's own `core.setting.changed`, `core.module.*`, `core.release.applied` and `core.job.died` are internal. A lint requires every event on a record type whose table has a subject to state `internal` explicitly, true or false, so the choice is always made on purpose. | Foundations | Module manifest |
| **Public addresses.** By Matt's decision a production is at `/whats-on/<slug>` while current and `/shows/<slug>` once past. `/whats-on` and `/shows` are core-owned address prefixes; `/archive` is replaced by `/shows`. A theatre may still override those pages from `site/`. | Core domain (3) | Module manifest |

**Scoped ids (Matt, by comment on question 6, 16 November 2026).** Every id is `<prefix>_<26 characters>`, after Flytower's platform. The prefix is declared on the table (`defineTable(name, columns, { id: 'ord' })`), two to four lower-case letters, unique across the registry, starting with `x` for a theatre's own module. `col.id()` makes one; `col.ref(table)` and route input validation accept only that table's prefix. The 26 characters sort by creation time by default; a table may declare `random: true`. Each workstream should add a prefix to every table in its data model; foundations keeps the list in part 4 so none clash.

**A number that is not whole.** The table layout gains one column type, `real` (SQLite REAL, a floating-point number), for measurements such as latitude and longitude. It is never used for money (which stays whole minor units), for a count, or for anything compared for exact equality or used as a key; the schema check refuses `real` on a column the money helpers produce. Raised by core domain for core\_venues.

**A person with no account and no email.** There is no third kind of subject. A table whose account subject column may be empty declares what happens to the rows it cannot link: `subject: { account: 'account_id', unlinked: 'staff' }`. Such rows hold their personal details in classed columns, are covered by the table's retention like any other, and are reached for erasure or a copy only by a member of staff with the module's redaction ability, who finds them by search; the erasure and download screens list every table that declares `unlinked` as a manual step. The schema check refuses a nullable account subject without it. Raised by front of house for people named in an incident.

**Rulings for the second round (16 November 2026).** `uses` may name a module that is not yet written, provided its id is in the list of module ids the design has reserved (front-of-house, spaces, bar, training, membership, communications); the build check refuses an id that is neither present nor reserved, and a `uses` on an absent module simply contributes nothing. A notification type may declare its lane, `prompt` (the default) or `bulk`; the notification service queues each send on the lane its type declares, so mailings never delay notices. The address prefix `/mailing` is reserved for communications' public confirm and manage pages, reached by token with no sign-in.

**Requirements: one point for "does this person meet this condition at this time" (16 November 2026).** Proposed by training, supported by integration.

- **The point.** `core.requirement`. A module that can judge a condition contributes a provider under its own id with three functions: `options()` for the picker an administrator chooses from, `describe(ref)` for a label, and `check(refs, { account, at, record? })`, which answers each reference with `met`, `unmet` (with a reason fit to show the person) or `unknown`.
- **References.** A host stores a reference as plain text, `<module>:<kind>:<id>`, for example `training:competency:cmp_…` or `membership:type:mty_…`. The host never reads inside it and holds no foreign key.
- **The kit call.** `requirements.check(refs, { account, at, record? })` answers all references in one call, at a stated instant, so a rota can ask about the night of the shift and not about today. A reference whose module is off or absent answers `unavailable`.
- **The host owns the consequence.** The kit gives verdicts only. The host decides whether unmet refuses, warns or prices differently, and owns any override; an override is audited with who allowed it. `unavailable` is never enforced and the host's screen says the condition is not being checked. A person with no account is `unmet`.
- **Facts are requirements too, without a second mechanism.** Any declared fact can be referenced as `fact:<fact name>`, for example `fact:front-of-house.on-shift`, and core answers it. So membership's eligibility and front of house's on-shift check go through the same call: membership contributes a provider for conditions an administrator picks by record (a membership type), and on-shift stays a fact.
- **Why facts stay a separate declaration.** A fact has a fixed name in a manifest and feeds the ability check, where it grants authority. A requirement is data an administrator chose and a host stored; it grants nothing and only answers a question. Folding facts into the point would let stored data confer abilities, which the abilities design forbids. The reverse direction, a fact answering as a requirement, is safe and is what is ruled here.
- **No separate eligibility points.** A module does not declare its own point for a per-person condition. `front-of-house.eligibility` and any membership pricing check use `core.requirement`.

**Requirements, amended the same day to training's fuller contract; where this differs from the list above, this prevails.** A reference has two parts, `<source>:<id>`, for example `training:tcmp_…`: the scoped id already says what kind of thing it is, so no kind is written. A fact is `fact:<fact name>`. A source contributes `options(query)` (reference, label, description), `describe(refs)` and `check(accountIds, refs, at, record?)`. The kit offers `requirements.options`, `requirements.describe` and `requirements.check`; a check takes several accounts and several references at once and answers each pair `met`, `not-met` or `unavailable`, with `until` (when a met verdict lapses, if known) and a translated reason. A source that is switched off or absent answers `unavailable`.

**A fact mapping may be pinned to one record.** A fact declared on a record type may be mapped to abilities for one named record of that type, for example `training.competent` for one competency, when the fact's declaration says `pin: true`. The mapping row holds the record's id; the fact is then judged against that record whatever record the ability is being used on. A mapping whose pinned record no longer exists grants nothing and the permission screen shows it as broken. Without `pin: true` a fact is judged only against the record in hand, as before. Subject to identity, which owns the mapping table and the permission screen.

**A record type's parent may be empty on a row.** A record type declares at most one parent type, and may declare it `optional`; a row with no parent simply inherits nothing. Raised by spaces, where a bookable wraps a space or stands alone (a van).

**A time-of-day setting.** The settings registry gains the kind `time`: a wall-clock time in the theatre's time zone, stored as `HH:MM`, with optional `min` and `max`.

**Requirements, a correction: what `unavailable` means is the host's choice.** The earlier line that `unavailable` is never enforced is withdrawn. The kit only reports `unavailable`; the host decides, for each use, one of two behaviours and its screen always says which happened. Where the requirement restricts who may do something (a duty, a booking), the host does not enforce it. Where the requirement grants a benefit (a member price, a concession), the host withholds the benefit, so switching a module off never hands the benefit to everyone. Raised by box office for member pricing.

There is no default. `requirements.check` takes a required argument, `whenUnavailable`, with the value `met` (a restriction) or `not-met` (a benefit), and the answer still says the verdict came from an unavailable source so the screen can say so. A call without the argument does not compile.

**Also noted from box office:** code point `box-office.checkout-consent` (communications contributes consent statements to the order batch), declared in box office's document.

**What switching a module off will cost.** A switchable module's manifest may declare `switchOff.impact()`, which returns short counted statements ("214 people lose the members' area"). The Modules screen shows them, with the modules that require this one, before the administrator confirms. This is a manifest entry of its own and not a use of `core.change-impact`, which is about a change to one record. Raised by membership.

**As built: what the kit settled (16 November 2026).** The foundation kit (F-01 to F-10 and F-34) has been built. Where it differs from older wording anywhere in this document, including code samples, this list prevails; the kit's guide, `docs/kit/README.md` in the repository, is the reference from here on.

1. `defineTable(name, columns, options)`: columns second, options last.
2. The content token is `:setting{name="..."}`. `key` cannot be used because Vue reserves it.
3. A point is read with `usePoint(name)`; `point()` is the manifest helper that declares one.
4. Rules that span several settings sit in a manifest field `settingRules`.
5. External calls are declared in a manifest section `calls`, each with a file `server/calls/<name>.ts` exporting `defineCall({ outcome, reconcile })`. The call site is `externalCall(name, { reference, key?, attempt?, call })`.
6. A switched-off module's jobs wait until it is switched on again (rule M4). The older line that they still run is withdrawn.
7. Sweeps for stuck jobs, lost messages and reconciliation run inside the cron tick. Old history is pruned by a daily task, `core.prune-history`. `core_task_runs` has a `job_id` column.
8. Rate limits have their limits as core settings, `core.rate-limits.<class>`. For the gate they are counted in memory in each Worker instance. That is accepted for the gate only: an in-memory count is not shared between instances, so before the first release the `sign-in` and `public-form` classes must count in a shared store (Cloudflare's rate limiting binding is the first thing to evaluate). Story F-36, first release.
9. Until F-28 (applying migrations by button) exists, pending migrations apply by themselves only where `PROSCENIUM_AUTO_MIGRATE=1`. The variable is removed when F-28 lands.
10. Names are enforced: settings `<module>.<group>.<name>`, abilities `<module>.<noun>.<verb>`, events `<module>.<record>.<past participle>`, jobs, tasks and calls `<module>.<verb>-<noun>`.
11. The guard is the table `core_guard(ok, code)` with a trigger before insert that ignores the row when `ok` is true and aborts the batch with `guard:<code>` otherwise, so the table stays empty. This replaces the null-into-not-null insert described in the Proofs tab.

**Free text about a person nobody can be linked to.** A table with subject none may hold a free-text column that could describe a person (the bar's optional description on an age check) on two conditions: the column is classed `col.freeText` with erase, never `col.personal`, and the table declares a retention setting, because the sweep is the only thing that will ever remove it. The schema check refuses a subject-none table that has a personal column, and refuses one with a free-text column and no retention.

**A subject may name an account and an email; the rule "never both" is withdrawn.** A table may declare `subject: { account: 'col_a', email: 'col_b', unlinked?: 'staff' }`. The account wins: a row with an account belongs to that account and its email column is only a contact detail. A row with no account is found by its email, when that address is a verified address of the person asking. A row with neither is unlinked. Erasure and download therefore sweep, for an account, the rows that name it and the rows with no account whose email is one of its verified addresses; a row that names another account is never matched by email. A module may set the account on such a row when the email is found to be a verified address, as the bar does for a floating tab. Raised by the bar; identity's sweep follows this.

**A second queue, for email outcomes.** Cloudflare Email Sending reports bounces, complaints, failures and rejections through an event subscription from one sending domain to a queue. The platform therefore declares a second queue binding, `EMAIL_EVENTS`, with no identifier, created on first deploy like the others and consumed by the same Worker, which hands each message to core's task `core.email-events`. It is kept apart from the jobs queue because its messages are Cloudflare's shape, not the platform's. The subscription itself cannot be made at first deploy, since the sending domain must be verified first, and the Worker holds no account token to make it. It is a setup step owned by core, shown once the domain is verified, with the clicks to make in the dashboard; a health check warns while the step is not done and when mail has been sent for a day with no outcome received. The domain's "Drop suppressed recipients" option stays off, and the same health text says so. "One queue" in older wording now means one queue for the platform's own jobs.
