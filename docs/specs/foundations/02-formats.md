# Formats

A module declares everything about itself in one file, `layers/<id>/module.ts` (`site/layers/x-<name>/module.ts` for a theatre's own module), and nothing about a module is registered anywhere else. This tab is the one-page version; the sub-tabs give each format field by field, and the last sub-tab is a whole module to copy from.

**Status: settled, 16 November 2026.** The kit that implements these formats is built (stories F-01 to F-10 and F-34), and its guide, `docs/kit/README.md` in the repository, is the reference from here on. The rulings at the foot of this tab were made in answer to the other workstreams; the sub-tabs were brought into line with them on 16 November after the consistency review, and where a difference is still found the "As built" list and the later ruling prevail.

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
| Table | module id in snake\_case, then a plural noun. Two kit tables are named for what they are and stay singular: `core_audit` and `core_guard` | `box_office_orders` |
| Column | snake\_case in SQL, camelCase in TypeScript | `created_at`, `createdAt` |
| Setting key | `<module>.<group>.<name>`, three kebab-case segments | `core.jobs.max-attempts` |
| Ability | `<module>.<record>.<verb>` | `box-office.order.refund` |
| Fact | `<module>.<name>` | `front-of-house.on-shift` |
| Record type | `<module>.<noun>`, singular | `core.performance` |
| Event | `<module>.<record>.<past participle>` | `box-office.order.confirmed` |
| Job | `<module>.<verb>-<noun>` | `communications.send-email` |
| Scheduled task | `<module>.<verb>-<noun>` | `core.prune-history` |
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
| **Point** | Several modules may supply the same kind of thing (a payment provider, a menu entry, a health check) | Soft: works with zero contributors |
| **Fact** | Authority should follow from a record (tonight's shift, a current training record) | Soft: a theatre maps abilities to it |

A write is a unit of work: the caller collects statements from its own code and from the services it calls, then commits them as one D1 batch. A service that writes adds statements to the caller's unit of work and never commits on its own. The audit entry and any event ride in the same batch. The detail is in part 4.

## What the build checks

`bun run check` fails when:

- a table or column has no data class, or a table's name lacks its module's prefix;
- a setting, ability, event, job or point name breaks its pattern or is declared twice;
- a content page quotes a setting that does not exist or is not marked quotable;
- a server route declares neither an ability (a declared one, or 'signed-in') nor public: true, or names no rate-limit class;
- a module imports from a module it does not list in `requires` or `uses`, or the core imports from any module;
- a label or help translation key is missing in British English;
- a module with something in `requires` could be switched on without it.

## Where this draft departs from the paper

For the integrating thread. Each is argued in the sub-tab named.

| Paper says | This draft says | Why | Sub-tab |
| --- | --- | --- | --- |
| A module has a version | No per-module version; the platform has one version, and a manifest records `since` | Modules ship together in one repository, so a second number can only disagree | Module manifest |
| Dependencies | Two kinds: `requires` (hard) and `uses` (soft) | Front of house uses Training's competencies through core.requirement but must run without it | Module manifest |
| "Payments needs Box office or Bar" | Box office and Bar each require Payments; no either-or dependencies | An either-or rule complicates switching for no gain | Module manifest |
| Scheduled tasks and queue consumers per module | One cron trigger and a fixed set of queues for the whole Worker (one per job lane, prompt and bulk, and one for email outcomes); modules declare tasks and jobs inside them | Deploy configuration stays fixed whatever modules exist, and schedules can follow the theatre's time zone | Module manifest |
| Migrations inside each module | One migration journal per owner: upstream's, and the theatre's in `site/` | Tables reference each other across modules, so order must be global | Data-class registry |
| Three sources of authority | Unchanged, but a derived fact is declared like a role a theatre maps abilities to | One permission screen covers both | Abilities registry |
| (not in the paper) | A registry of record types | Record-scoped permissions, audit targets, files and custom fields all need to name a kind of record | Abilities registry |

## Nothing is open

The three points draft 1 left open are closed. Settings are site-wide, with no override for a venue or a production (Matt, question 1). The interface fixed the menus a navigation entry may name. Identity fixed the fifteen preset roles that presets map abilities to.

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
| `A navigation entry names a menu: account, members, console or live. These are menus, not shells: the interface has three shells (public, members and console) and a live mode with no navigation, and the account menu sits in the public shell. Address prefixes are reserved, and a check refuses a theatre page under one; the one list is in the Module manifest tab` | 6 | Module manifest |
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
| `/files` is a reserved address prefix (the one list is in the Module manifest tab) | Core domain (3) | Module manifest |
| A manifest has a `credentials` section for keys entered in the console and stored encrypted, beside `secrets` for deployment secrets | Box office (4) | Module manifest |
| `externalCall({ attempt, call, outcome })` is the one self-committing exception to the unit of work | Box office (4) | The kit |
| An append-only table may have erasable columns; the trigger permits exactly the erasure update and nothing else | Box office (4) | Data-class registry |
| A table's subject may be a person with no account: `subject: { email: 'contact_email' }`, declared with `col.email` (stored trimmed and lower-cased). A table may name both an account and an email (see the later ruling; the account wins). Rows holding money, a ticket or a booking key to an account, which may be unclaimed. | Box office (4), identity (2) | Data-class registry |
| Account erasure and download also sweep email-subject rows for every address verified on the account | Identity (2) | Data-class registry |
| Audit rows carry `allowed_by` (the grant or fact that passed the check) and there is a `read` action kind, declared on an ability with `audit: 'read'` | Identity (2) | Abilities registry |
| `defineRoute` gains `protect: 'turnstile'`; one secret and one verification service, both core's | Identity (2), integration | The kit |
| Rate-limit classes are `default`, `write`, `sign-in`, `public-form`, `export` and (added later) presented-value | Identity (2) | The kit |
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

**Rulings for the second round (16 November 2026).** `uses` may name a module that is not yet written, provided its id is in the list of module ids the design has reserved (public-site, front-of-house, spaces, bar, training, membership, membership-fees, communications); the build check refuses an id that is neither present nor reserved, and a `uses` on an absent module simply contributes nothing. A notification type may declare its lane, `prompt` (the default) or `bulk`; the notification service queues each send on the lane its type declares, so mailings never delay notices. The address prefix `/mailing` is reserved for communications' public confirm and manage pages, reached by token with no sign-in.

## Requirements: the point `core.requirement`

One point for "does this person meet this condition at this time". Proposed by training and supported by integration; amended during 16 November 2026 by training, box office and membership. This section is the whole contract as it now stands and replaces the separate entries that built it up.

- **References.** A host stores a requirement as plain text in two parts, source id, colon, id, for example `training:tcmp_…`; the scoped id already says what kind of thing it is. A fact is `fact:` followed by the fact's name, for example `fact:front-of-house.on-shift`, and core answers it. The host never reads inside a reference and holds no foreign key.
- **A source.** A module that can judge a condition contributes a source under its own id with `options(query)` (reference, label, description, for the picker an administrator chooses from), `describe(refs)`, `check(accountIds, refs, at, record?, presented?)` and, optionally, `holder(evidence)`.
- **The kit calls.** `requirements.options`, `requirements.describe`, `requirements.check` and `requirements.holder`. A check takes several accounts and several references at once, at a stated instant, so a rota can ask about the night of the shift and not about today. It answers each pair `met`, `not-met` or `unavailable`, with `until` (when a met verdict lapses, if known), a translated `reason` for the person, and optionally a `summary`, `evidence` and a help link.
- **Unavailable is the host's choice, and there is no default.** A source that is switched off or absent answers `unavailable`. `requirements.check` takes a required argument `whenUnavailable`: `met` where the requirement restricts who may do something (a duty, a booking), so a missing module never locks people out; `not-met` where it grants a benefit (a member price, a concession), so switching a module off never hands the benefit to everyone. The answer still says the verdict came from an unavailable source, and the host's screen says so. A call without the argument does not compile.
- **The host owns the consequence.** The kit gives verdicts only. The host decides whether not met refuses, warns or prices differently, and owns any override; an override is audited with who allowed it.
- **Facts stay a separate declaration.** A fact has a fixed name in a manifest and feeds the ability check, where it grants authority. A requirement is data an administrator chose and a host stored; it grants nothing and only answers a question. Folding facts into the point would let stored data confer abilities, which the abilities design forbids. The reverse, a fact answering as a requirement, is safe.
- **No separate eligibility points.** No module declares a point of its own for a per-person condition.
- **A value the person presents, with no account.** `describe(refs)` may say `presentable: { label, shape }`, which tells the host to show a field and how to label and validate it. `presented` is a list of `{ ref, value }` (what was typed) or `{ ref, evidence }` (what an earlier answer returned). The host stores the evidence with what it sold, never the typed value, and may ask again later with the evidence, for example at the door. The typed value is never written to the audit log, an event or a job. With an account and a presented value together, the source judges the account first. A person with no account is not met unless a presented value is accepted. Evidence is an id, and an id is never a secret: holding a piece of evidence proves nothing by itself, and the source judges it afresh each time.
- **Guessing is limited by the kit, not by each source.** Any check that carries a typed value counts against the rate-limit class `presented-value`, keyed by session and by network address. Past the limit the answer is not met with a reason to wait, and the source is not called. This class counts in the shared store required by story F-36. A source that wants to stop one value being used by many buyers limits that itself.
- **A summary for staff.** An answer may carry `summary`, one short translated sentence worded by the source for any verdict ("Member: current until 31 July 2027"). The host shows it unchanged and may keep the latest one, for example in the door's offline data. It holds no name, no typed value and nothing the person at the screen may not see.
- **A name is never in an answer.** When a host's staff need to see a name the source holds (a steward comparing a card at the door), the source offers `holder(evidence)` and names the ability that guards it, declared `audit: 'read'`. Hosts call `requirements.holder(ref, evidence)`; the kit checks that ability for the member of staff asking, records the read, and returns a display name or nothing. Staff only, live, never offline, and never in an answer, a summary, an event or a job. Decided after Matt asked that a union's list keep names to prevent misuse.

* **A quantity (added 16 November 2026 for the access scheme).** A met answer may carry `quantity`, a whole number of nought or more: how many of the thing the host may grant on this requirement, for example the companions accepted for a person. It is absent when the source has no number to give, and the host then applies its own limit. The host treats it as it treats the verdict: it may copy it onto what it sold and put it in a condition on its own statement, and it never appears in a summary, an event or a job. No other typed value is carried in an answer; a source with more to say offers a service of its own.
* **Asking about somebody else.** A source may name `checkAbility`, an ability declared `audit: 'read'`. Where it does, a check about the actor's own account is answered as usual, and a check about any other account is passed to the source only if the actor holds that ability, with the read recorded against the account asked about. Otherwise that pair answers not met with a reason and the source is not called. A caller with no actor (a job or a task) is treated as not holding it. A source that names none answers for any account, as a rota needs.

**A fact mapping may be pinned to one record.** A fact declared on a record type may be mapped to abilities for one named record of that type, for example `training.competent` for one competency, when the fact's declaration says `pin: true`. The mapping row holds the record's id (identity's table core\_fact\_abilities is keyed by three columns: fact, ability and pinned\_record); the fact is then judged against that record whatever record the ability is being used on. A mapping whose pinned record no longer exists grants nothing and the permission screen shows it as broken. Without `pin: true` a fact is judged only against the record in hand, as before. Subject to identity, which owns the mapping table and the permission screen.

**A record type's parent may be empty on a row.** A record type declares at most one parent type, and may declare it `optional`; a row with no parent simply inherits nothing. Raised by spaces, where a bookable wraps a space or stands alone (a van).

**A time-of-day setting.** The settings registry gains the kind `time`: a wall-clock time in the theatre's time zone, stored as `HH:MM`, with optional `min` and `max`.

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
8. Rate limits have their limits as core settings, `core.rate-limits.<class>`. As built for the gate each is a whole number allowed in a fixed one-minute window; the specification's value is a count and a period (part 6), and the kit moves to it with F-36. For the gate they are counted in memory in each Worker instance. That is accepted for the gate only: an in-memory count is not shared between instances, so before the first release the `sign-in` and `public-form` classes must count in a shared store (Cloudflare's rate limiting binding is the first thing to evaluate). Story F-36, first release.
9. Until F-28 (applying migrations by button) exists, pending migrations apply by themselves only where `PROSCENIUM_AUTO_MIGRATE=1`. The variable is removed when F-28 lands.
10. Names are enforced: settings `<module>.<group>.<name>`, abilities `<module>.<noun>.<verb>`, events `<module>.<record>.<past participle>`, jobs, tasks and calls `<module>.<verb>-<noun>`.
11. The guard is the table `core_guard(ok, code)` with a trigger before insert that ignores the row when `ok` is true and aborts the batch with `guard:<code>` otherwise, so the table stays empty. This replaces the null-into-not-null insert described in the Proofs tab.

**Free text about a person nobody can be linked to.** A table with subject none may hold a free-text column that could describe a person (the bar's optional description on an age check) on two conditions: the column is classed `col.freeText` with erase, never `col.personal`, and the table declares a retention setting, because the sweep is the only thing that will ever remove it. The schema check refuses a subject-none table that has a personal column, and refuses one with a free-text column and no retention.

**A subject may name an account and an email; the rule "never both" is withdrawn.** A table may declare `subject: { account: 'col_a', email: 'col_b', unlinked?: 'staff' }`. The account wins: a row with an account belongs to that account and its email column is only a contact detail. A row with no account is found by its email, when that address is a verified address of the person asking. A row with neither is unlinked. Erasure and download therefore sweep, for an account, the rows that name it and the rows with no account whose email is one of its verified addresses; a row that names another account is never matched by email. A module may set the account on such a row when the email is found to be a verified address, as the bar does for a floating tab. Raised by the bar; identity's sweep follows this.

**A second queue, for email outcomes.** Cloudflare Email Sending reports bounces, complaints, failures and rejections through an event subscription from one sending domain to a queue. The platform therefore declares a second queue binding, `EMAIL_EVENTS`, with no identifier, created on first deploy like the others and consumed by the same Worker, which hands each message to core's task `core.email-events`. It is kept apart from the jobs queue because its messages are Cloudflare's shape, not the platform's. The subscription itself cannot be made at first deploy, since the sending domain must be verified first, and the Worker holds no account token to make it. It is a setup step owned by core, shown once the domain is verified, with the clicks to make in the dashboard; a health check warns while the step is not done and when mail has been sent for a day with no outcome received. The domain's "Drop suppressed recipients" option stays off, and the same health text says so. "One queue" in older wording now means one queue for the platform's own jobs.

**A signing service in the kit.** Raised by box office for door codes that a device checks with no connection; the kit owns the keys, so no module signs on another's behalf. Story F-37, first release.

- **Declared.** A module declares each use in its manifest: `signing: [{ purpose: 'box-office.door-code', rotateEvery: '365d', keepFor: '730d' }]`. A module that adds a kind of code to another module's point signs under that host's purpose, through the point.
- **Called.** `signing.sign(purpose, bytes)` returns the key id and signature; `signing.verify(purpose, keyId, bytes, signature)` answers yes or no; `signing.publicKeys(purpose)` returns every key still valid for checking, with ids and dates, for a device to hold offline.
- **Keys.** Asymmetric, so a device that holds only public keys can check a code but cannot make one. The algorithm is one that both Workers and ordinary browsers offer through Web Crypto; ECDSA on P-256 is the working choice, to be confirmed against current documentation when built. Keys are made by the application, never typed or deployed. Table `core_signing_keys`, id prefix `sgk`: purpose, public key, private key encrypted by the same secret that protects `core_credentials`, state (current, checking only, retired), dates.
- **Rotation.** A scheduled task makes a new current key when one is due; the old key checks only until `keepFor` has passed, then is retired and its private part erased. An administrator may retire a key at once from the health screen, which invalidates every code signed with it and says so before confirming.
- **What a signature is not.** It proves the code was issued by this theatre. It does not prove the ticket is still valid, so the device still needs its offline list, and a signed code is not a secret.

**As built, continued (16 November 2026).** `defineRoute` checks the ability before it validates the input, so a refused caller learns nothing of the input's shape. The actor carries an optional `sessionId`. A privileged ability may be declared `fresh: false` only when it reads and is declared `audit: 'read'`; a privileged ability that changes anything always needs a fresh sign-in, and the manifest check refuses otherwise. The default of `core.access.fresh-within` is 10 minutes, at identity's request.

To be exact about privileged abilities: every one needs a strong session. One that changes something also needs a fresh sign-in. One that only reads is declared `fresh: false` with `audit: 'read'`, so it is strong and audited but never asks again, however sensitive the data. `core.access.fresh-within` is the only freshness window, default 10 minutes, allowed from 1 minute to 1 hour.

**Personal data about people who can never be linked to an account.** A table may declare `subject: { unlinked: 'staff' }` with no account or email column at all, for example a list of members supplied by another body, with names. This is not subject none: the table says it holds personal data and that only staff can find a person in it. It must declare a retention setting and name the ability that lets staff search and redact it; its personal columns are `col.personal` with erase; the data request screen lists it as a manual step. Subject none still means no personal column at all.

## Rulings of 16 November 2026, after the consistency review

**As built, a third list.** A route for anyone says `public: true`; a route for any signed-in person says `ability: 'signed-in'`; every other route names a declared ability. There is no `ability: 'public'`. A setting is read on the server with `await useSetting(key)`, in components with `usePublicSettings()` (settings of audience public only), and in content with the setting token. A job's stored states are queued, running, done, dead and cancelled; a failed attempt with attempts left goes back to queued with a later run time, so there is no failed state. A task run records done or failed.

**Reserved address prefixes: one list.** The list is in the Module manifest tab and nowhere else. It now also holds `/forms` (asked for by forms, for a form's own page). Box office's public pages for managing a booking and buying a pass sit under `/book`, which it already owns, so no further prefix is reserved for them.

**Module ids the design has reserved.** `public-site` and `membership-fees` join the list. `public-site` is a real, switchable module that requires core; while it is off, `/whats-on` and `/shows` stay reserved and answer page not found.

**Realm values.** A table's realm is `audience`, `members`, `operational` or `system`. `members` is the same word identity uses for a person's side. `system` is for the platform's own tables (modules, settings, jobs, audit), which hold nothing about a theatre's public or its work.

**A setting may require a reason or a confirmation.** The settings registry gains the field `onChange`, with the value `reason` or `confirm`. The field `change` remains the ability needed. The registry also has the kinds `time` and `rate` (a count and a period).

**Who holds a fact.** A fact declaration may give `holders(record?)`, which lists the accounts that hold the fact now, for one record or for any. Identity's `holdersOf` uses it, for example to show who an ability reaches. A fact without it cannot be enumerated and the permission screen says so. It is a read like the resolver: async, pure, never queued.

**One encryption key, and a column option.** `col.special()` is always encrypted. `col.internal()` and `col.personal()` take `encrypted: true`. All of them use the one core key, `CORE_ENCRYPTION_KEY`, and store its version beside the value so the key can be rotated. No module brings a key of its own. Asked for by the core domain for webhook secrets and push keys.

**Public components and content.** A public component keeps its module-prefixed name. An entry in `core.public-component` may declare an `alias`, unique across the system, which is the short name a theatre writes in a content file.

**A record type without a table.** A record type may have no table and a fixed set of ids, for example `core.branding` with the one id `site`. Its resolver gives the label, the address and the parent.

**Listening to everything that may leave.** A listener may declare `on: 'deliverable'` and receives every event not marked internal. Only core may declare it; the webhook sender is the one user.

**The core contributes to no module's point.** The core never imports a module and never contributes to a point a module declares. A module that wants something of core's on its own point declares the contribution itself, reading core's services and facts. Communications declares its audience sources this way (integration's ruling R-06).

**Table names.** A table is the module id and a plural noun. `core_audit` and `core_guard` are the two exceptions.
