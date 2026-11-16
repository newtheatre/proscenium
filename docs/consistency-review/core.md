# Core domain and public site: consistency findings

Area reviewed: `docs/specs/core-domain-and-public-site/` (all 11 files and the three wireframe images' captions), checked against foundations (including the rulings at the end of `02-formats.md`), identity, box office, form builder, the interface spec and the design paper. Paths below are relative to `/home/user/proscenium/docs/`; `core/` means `specs/core-domain-and-public-site/`, `found/` means `specs/foundations/`, `ident/` identity, `bo/` box-office-payments-ledger, `forms/` form-builder, `ui/` interface-and-wireframes, `paper/` design-paper.

## Summary

42 findings: 7 HIGH (F1 to F7), 20 MEDIUM (F8 to F27), 15 LOW (F28 to F42).

The three most important:

1. **The `side` value is `member` in core and `members` everywhere else** (F1). Core's five `side` columns, its notification-type table and `realm: { column: 'side' }` would not match identity's `addressFor(accountId, 'members')` or the shells. Core's own scope tab (A8) says it should be fixed and it was not.
2. **Core declares its own organisation and locale settings that duplicate foundations' `core.site.name` and `core.locale.*`, and two more duplicate interface settings** (F2, F3, F4). Same job, different keys, different defaults (time zone `Europe/London` against unset). A build with both has two switches for the credit line and two for dark mode.
3. **Three schema or token rules that the build will reject** (F5, F6, F7): `:setting{key=...}` (the as-built kit says `name`), nullable account subjects with no `unlinked` declaration, and settings and abilities that core's own stories and tables rely on but that are missing from its settings tab (`public-site.archive.public`, the four `core.webhooks.*` settings, `core.webhook.manage`, `core.programme.team-standing-after`).

Prevailing authority used: foundations `02-formats.md` rulings and "As built" list; identity for `side`, accounts and presets; box office for sale state, capacity and orders; the glossary in `paper/12-build-backlog-and-glossary.md` ("side: Identity owns it").

---

## HIGH

### F1. HIGH. Side value: `member` (core) against `members` (identity, glossary, shells)

- Side A, core: `core/03-data-model.md:335` (and 353, 377, 393, 467): "`side` | text | not null, one of `audience`, `member`". `core/05-interface-to-other-modules.md:173-176`: notification types have Side "Member". `core/02-scope.md:48` (A8): "Its name for the members' side is 'members'; this document's 'member' should read the same." Core also contradicts itself: `core/03-data-model.md:9` says "Realm (audience, members or operational)".
- Side B, identity: `ident/05-interface-to-other-modules.md:38`: "`addressFor(accountId, side)` ... `side` is `audience` or `members`." `paper/12-build-backlog-and-glossary.md:89`: "side | Identity and Core both use it for audience or members | One meaning; Identity owns it". Identity's columns are `members_email_id`.
- Related: `found/02-4-data-class-registry.md:66` also lists the realm values as "`audience`, `member` or `operational`" (singular). Because core declares `realm: { column: 'side' }`, the column values and the realm names must be the same words.
- Prevails: identity (owns "side"). Fix: change every core `side` value and the notification type tables to `members`, and change `found/02-4-data-class-registry.md:66` to `members` so that realm and side share one vocabulary. A8 in `core/02-scope.md` should then be marked done.
- Owner: core 2 and 4 (and 1 for the three-word realm list); foundations 02-4.

### F2. HIGH. Organisation and locale settings duplicated in foundations and core, with different keys, defaults and audience

- Side A, foundations: `found/08-settings-and-abilities.md:13-17`: `core.site.name` ("unset"), `core.locale.time-zone` (default `Europe/London`, audience internal), `core.locale.currency` (GBP, public), `core.locale.language` (`en-GB`), `core.locale.day-start` (time, `04:00`, 00:00 to 08:00). `found/05-states-and-rules.md:107` (J6): task times are "Europe/London wall-clock times by default, taken from `core.locale.time-zone`".
- Side B, core: `core/07-settings-and-abilities.md:13-18`: `core.organisation.name`, `core.organisation.time-zone` (default "unset", audience public), `core.organisation.locale` (`en-GB`), `core.organisation.currency`, `core.organisation.day-rollover` (04:00, 00:00 to 08:00).
- Same five facts, two key sets, a different default for the time zone (a task scheduled `dailyAt` before the setup step has run needs a default; core's "unset" blocks it) and a different audience (internal against public). `core.setting.changed` handling in `core/05-interface-to-other-modules.md:110` and the story C-37 name the core keys; the kit's `now()`/`today()` and J6 name foundations'. The kit (F-01 to F-10) is already built against foundations' names.
- Prevails: foundations (the kit is built and J6 depends on it). Fix: core drops `name`, `time-zone`, `currency`, `locale` and `day-rollover` and keeps only the genuinely additional `core.organisation.*` keys (short-name, week-start, country, contact details, social links, legal name, charity number). Core's prose ("the hour the operating day rolls over", `core.recompute-days`) should cite `core.locale.day-start`. Settle the time-zone default (foundations says London; core says unset) and whether it is public (the public pages and calendar feed show local times).
- Owner: core 6; foundations 6 to confirm which side owns what.

### F3. HIGH. Credit-line setting declared twice

- Side A, core: `core/07-settings-and-abilities.md:39`: "`core.brand.credit-line` | boolean | true ... Shows 'Powered by Proscenium' in the public footer".
- Side B, interface: `ui/06-settings-and-abilities.md:17`: "`core.shells.credit-line` | On or off | On | Site owner | No". `ui/05-1-shells-and-navigation.md:27` footer: "an optional credit line".
- Prevails: unclear. Core's file also says (`ui/06-settings-and-abilities.md:29`) "Brand colour, logo, fonts and name are workstream 3's settings; they are not repeated here", which suggests the brand side owns it. Pick one key, delete the other, and name which ability changes it (`core.branding.edit` in core; "Site owner" in interface).
- Owner: interface 6 and core 6.

### F4. HIGH. Default colour mode declared twice (and the paper says it is one control)

- Side A, core: `core/07-settings-and-abilities.md:38`: "`core.brand.default-mode` | choice | `auto` | auto, light, dark ... The mode a first-time visitor sees".
- Side B, interface: `ui/06-settings-and-abilities.md:23,25`: "`core.appearance.default` | `system`, `light` or `dark` | `system`" and "`core.appearance.public-dark` ... Off pins the public shell to light". `ui/09-questions-for-matt.md:12` (U6, decided (a)): follows the device, with a switch to pin it light.
- `paper/11-design-stage-questions-and-status.md:122`: "C3 and U6 overlap. The default mode in branding and the public site's dark mode are one control. Answering U6 settles both." U6 is answered, C3 is answered, and both settings still exist. Also the value names differ (`auto` against `system`).
- Prevails: the U6 decision (interface). Fix: core removes `core.brand.default-mode` or the interface removes `core.appearance.default`; keep one set of values.
- Owner: core 6 and interface 6.

### F5. HIGH. Content token written `:setting{key=...}`; the as-built kit says `name`

- Side A, core: `core/05-interface-to-other-modules.md:246`: "`:setting{key="box-office.orders.seat-cap"}`, the form the foundations draft fixes." `core/08-stories.md:83` (C-41): "`:setting{key=...}`". Component `setting` has property `key` (`core/05-interface-to-other-modules.md` public components table).
- Side B, foundations: `found/02-formats.md:196` (As built, item 2): "The content token is `:setting{name="..."}`. `key` cannot be used because Vue reserves it." The same tab says the as-built list "prevails over older wording ... including code samples".
- Prevails: foundations as-built. Fix core 4 (token, component property, C-41, test "The unknown token"). Note foundations' own `02-2-settings-registry.md:92`, `05-states-and-rules.md:132` (R4) and `09-stories.md:42` (F-22) still say `key`; they should be brought into line at the same time.
- Owner: core 4 and 7; foundations stale tabs.

### F6. HIGH. Nullable account subjects without the required `unlinked` declaration

- Side A, core: `core/03-data-model.md:85`: `core_production_credits.account_id` "account, role subject ... nullable ... A credit with no account is a historical or outside credit". `core/03-data-model.md:307`: `core_files.uploaded_by` "account, role subject ... nullable". `core/03-data-model.md:336`: `core_notifications.account_id` "nullable" (and `address` for sends with no account). Each table declares only `subject` as that column.
- Side B, foundations: `found/02-formats.md:163`: "A table whose account subject column may be empty declares what happens to the rows it cannot link: `subject: { account: 'account_id', unlinked: 'staff' }` ... The schema check refuses a nullable account subject without it." Also `found/02-formats.md:209`: a subject may name an account and an email column.
- Effect: three tables fail the schema check. Fix: for credits, declare `unlinked: 'staff'` (and state who finds them, since the printed name is public and kept); for files likewise (or decide `uploaded_by` is role `actor`; the note "Subject only for `original_name`" suggests the clearing is the only subject-like behaviour); for notifications use `subject: { account: 'account_id', email: 'address' }` if `address` is declared with `col.email`.
- Prevails: foundations. Owner: core 2.

### F7. HIGH. Settings, ability and screens that other core tabs depend on are not in the settings and abilities tab

- Core 03 (webhooks, `core/03-data-model.md:514-522`) declares ability `core.webhook.manage`, settings `core.webhooks.max-attempts`, `.pause-after`, `.log-retention`, `.timeout`, job `core.send-webhook`, notification type `core.webhook.paused`, event `core.webhook.paused`, screen "Console, Webhooks". None appear in `core/07-settings-and-abilities.md` (22 abilities, no webhook ability), in `core/05-interface-to-other-modules.md` (jobs table `:199-209`, events table `:84-102`, core notification types `:171-176`) or in `core/06-screens.md` (Console inventory has no Webhooks screen).
- `core/08-stories.md:96` (C-47) and `core/10-questions-for-matt.md:104` use "`public-site.archive.public` (boolean, default on, changed by `public-site.site.configure`)". The public-site settings table (`core/07-settings-and-abilities.md:~149-155`) lists `archive.from-year`, `listing.cancelled-visible`, `feeds.calendar`, `data.open`, `search.hidden`, `meta.title-pattern` but not `archive.public`.
- `core/07-settings-and-abilities.md:139` (fact `core.production-team`) introduces `core.programme.team-standing-after` (default 30d, 0d to 365d). It is not in the "Settings: programme" table.
- Foundations' build check refuses a setting, ability or event declared nowhere; and a manifest assembled from part 6/part 4 would lack these. Fix: add all of them to 06 and 07 (and note in the overview that the ability count is 23, not 22).
- Prevails: the data-model and decision text (Matt's decisions). Owner: core 4, 5, 6.

---

## MEDIUM

### F8. MEDIUM. Two points for "a module adds a panel to a core record page"

- Side A, core: `core/05-interface-to-other-modules.md:125`: "`core.production-section` | data | A component, a position and an ability | Extra panels on the console production page (Box office's sales summary, Front of house's rota)". `core/06-screens.md:41`: "Tabs: Details, Dates, ... then any `core.production-section` panels."
- Side B, interface and forms: `ui/04-interface-to-other-modules.md:16,75`: "`core.record-tab` | A tab on another module's record page (Tickets on a production)". `forms/05-interface-to-other-modules.md:109`: forms contributes "`core.record-tab` | The record-fields panel on a core record ... This is how custom fields reach core records without core importing forms".
- Both are in the foundations index (`found/06-interface-to-other-modules.md:50`). Core's console production page reads only its own point, so forms' custom-fields panel and the interface's tab would never appear on it. 
- Prevails: the interface's generic `core.record-tab` (works for every record type, and two other specs already contribute to it). Fix: core drops `core.production-section` (or defines it as a thin alias) and its screens/wireframe read `core.record-tab`; foundations index updated.
- Owner: core 4 and 5; foundations 4 index.

### F9. MEDIUM. "Suggested holders" are not preset roles

- Side A, core: `core/07-settings-and-abilities.md:99-122`: suggested holders "Programme manager", "Theatre manager", "Duty manager", "Every member of staff", "Marketing", "Administrator". `core/07-settings-and-abilities.md:130`: "'Suggested holders' are for the presets, which workstream 2 and the integrating thread own."
- Side B, identity: `ident/07-settings-and-abilities.md:138-156`: the 14 preset keys (owner, administrator, committee-member, box-office-manager, box-office-staff, front-of-house-manager, bar-manager, technical-manager, finance-officer, membership-officer, communications-officer, production-lead, visiting-company, volunteer) plus welfare-lead. No programme manager or theatre manager; "marketing" is `communications-officer` (Publicity officer, Marketing manager); a duty manager is "not a role" (`ident/07-settings-and-abilities.md:159`: "Work done on the night is not a role"). Line 162: "Every other workstream adds its own abilities to these keys in its manifest's presets."
- Effect: no preset role would hold `core.season.manage`, `core.production.create`, `core.performance.schedule`, `core.venue.manage`, `core.closure.manage` except Owner and administrator, which is the phase-2 gate ("a theatre publishes a season").
- Prevails: identity's preset keys. Fix: core maps each ability to preset keys (for example `production-lead` on a production, `administrator`, `communications-officer` for publish), or asks identity for a programming role (the paper holds the count at fifteen, `paper/12-build-backlog-and-glossary.md:146`).
- Owner: core 6 (and identity if a role is wanted).

### F10. MEDIUM. Inbox and notification preferences: no declared contribution to `core.account-section`, and ownership claimed in three places

- Core: `core/06-screens.md:27`: "These sit wherever workstream 2 places the account area." `core/05-interface-to-other-modules.md:131` lists core's contributions (navigation, setup-step, health-check, record-resolver, erasure-handler) and has no `core.account-section`.
- Interface: `ui/05-screens.md:24`: "Notifications inbox | Read and unread, with a count | Signed-in person | List | Yes" among the screens "the interface layer itself owns"; `:23` lists "preferences" in the account frame.
- Identity: `ident/06-screens.md` has "Your details" but no inbox or notification preferences; `ident/05-interface-to-other-modules.md:160` offers `core.account-section` as the way modules add sections.
- Result: each side thinks the other owns it, and core does not contribute the section. Fix: core declares `core.account-section` contributions for Inbox and Notification preferences (one per side) and states that the page content is core's and the frame the interface's; interface removes "Notifications inbox" from its own 31 or marks it "content: workstream 3".
- Owner: core 4 and 5; interface 5.

### F11. MEDIUM. Notification types that identity and foundations need are declared nowhere

- Core `core/05-interface-to-other-modules.md:171-176` declares four types (`core.credit.added`, `core.delivery.failed`, `core.digest`, `core.test`); the data model adds `core.webhook.paused` (`core/03-data-model.md:520`), not in that table.
- Identity sends sign-in links and codes (`ident/05-interface-to-other-modules.md:200`: "`core.send-sign-in-link` ... Hands the link and code to notifications"), a first email to somebody named by another person (`:53`), grant-expiry warnings (`:136`) and erasure and export messages, and `ident/09-test-plan.md:62` tests "Every template rendered for an account without a standing". Foundations needs "the notification service that the health screen uses to tell administrators about dead jobs and failed updates" (`found/06-interface-to-other-modules.md:114`) and F-31 ("one notification, not one a minute"). Neither side lists the type keys, side, category or the sender, and identity's points table has no contribution to `core.notification-type`.
- C-27 (`core/08-stories.md:59`) says the phase-1 call becomes "a transactional notification type" in phase 2 without naming which module declares it.
- Fix: identity and foundations each add their types (key, side, category) to their own interface tab as contributions to `core.notification-type`; core adds a line to "What this workstream needs from the others".
- Owner: identity 4, foundations 4, core 4.

### F12. MEDIUM. `notifyAddress` for "a guest booking" against identity's ruling that guests are accounts

- Core: `core/05-interface-to-other-modules.md:69`: "`notifyAddress` ... for an address with no account, such as a guest booking. Email only." `core/02-scope.md:46` (A6): "...or a bare address for a guest".
- Identity: `ident/05-interface-to-other-modules.md:46`: "Every human a module records is a `core_accounts` row, made by `findOrCreateAccount`; an unclaimed account is exactly a person with no credentials. No module stores a name or address of its own for a person." `:38`: `addressFor` returns "the address it was created with" for an unclaimed account. Box office confirms (`bo/05-interface-to-other-modules.md:~137`: it calls `findOrCreateAccount` at checkout; the only exception is an anonymous walk-up sale, which sends no receipt).
- Effect: the example given for `notifyAddress` does not exist; legitimate callers are only pre-account sends (sign-in link to an unknown address, a mailing-list confirmation with an email-subject row). Core's text and `core_notifications.address` rationale should say that, and A6 should be reworded.
- Prevails: identity. Owner: core 2 (A6), core 4.

### F13. MEDIUM. Box office says its audience messages go "through the communications service"; core's service is `notify`

- Side A, box office: `bo/05-interface-to-other-modules.md:164`: "Each is queued as a job through the communications service and respects the core's suppression list for anything that is not transactional."
- Side B, core: `core/05-interface-to-other-modules.md:66-71` and `core/08-stories.md:59`: modules send with `notify` / `notifyAddress` inside their own unit of work; test "The same route" (`core/09-test-plan.md:68`): no send may bypass them. Communications is a later module (`core/02-scope.md:30`) and, per `core/05-...:280-291`, reads core's suppression list and does not send transactional mail. Box office also has no declared `core.notification-type` contribution in its points table (`bo/05-interface-to-other-modules.md:88-97`), and says (`:164`) that suppression applies to "anything that is not transactional" while core's rule (`core/04-states-and-rules.md:144-146`) is that the suppression list skips every delivery, including transactional ones ("the address is on the suppression list").
- Prevails: core (the pipeline owner). Fix: box office names `notify`, declares its types (order confirmed, cancelled, rescheduled, refund sent, waiting-list offer, payment did not complete) and drops "communications service". The suppression sentence needs one rule: core says a hard-bounced address is skipped for everything.
- Owner: box office 4; core 3/4 to confirm the suppression rule.

### F14. MEDIUM. "Moved" means different things; box office does not listen to core's `moved` or `capacity-changed`; the capacity contract is vague

- Core: `core/05-interface-to-other-modules.md:91-93`: `core.performance.rescheduled` = "The time changes"; `core.performance.moved` = "The venue or space changes"; `core.performance.capacity-changed`. `core/02-scope.md:49` (A9): "Box office enforces capacity as a database constraint and reads the house capacity from `capacityOf()`". `core/04-states-and-rules.md:91`: new capacity "Not below what Box office says is already held or sold".
- Box office: `bo/08-stories.md:70` (BO-53): "As a box-office manager I handle a moved performance | Ticket holders are emailed the new time" (that is core's rescheduled). `bo/05-interface-to-other-modules.md:158-162`: BO hears `cancelled`, `rescheduled`, `completed`, `account.merged`, `setting.changed` and nothing else. `bo/05-interface-to-other-modules.md:200`: needs "A space's own capacity, to compare a pool against | Assumed". `bo/08-stories.md:18` (BO-04): box office itself "raise[s] or cut[s] capacity".
- Gaps: (a) a move to another space changes the seating plan and the space capacity that BO's plan and pools depend on, and BO listens to nothing for it; its change guard (`bo/05-...:92`) refuses "cancelling or moving" with sold tickets, using "moving" for time. (b) `capacityOf(performanceId)` returns the performance's own value if set, not "a space's own capacity" that BO needs for `exceed-venue`. (c) Two places set capacity (core's `capacity` column through `core.performance.schedule`; BO pools through `box-office.performance.manage`) with no stated relation, and BO does not read `capacityOf()` at all.
- Fix: box office adopts core's names (rescheduled for time, moved for place), listens to `moved` and `capacity-changed`, and core adds a service for a space's own capacity (for example `capacityOfSpace`) or `getPerformance` states it explicitly; document that BO's pool total must not exceed `capacityOf()` unless `exceed-venue`.
- Owner: box office 4 and 7; core 4.

### F15. MEDIUM. Forms keeps a label snapshot where core says a record never stores the label

- Core: `core/03-data-model.md:261`: "**A record stores a term's id, never its label.** Renaming a term renames it everywhere, past and present."
- Forms: `forms/05-interface-to-other-modules.md:122`: "the answer stores the term's id with a snapshot of its label, never the label alone"; `:163`: "forms stores the term id and a label snapshot".
- A deliberate exception for submitted answers is reasonable (a submission is evidence), but core says the rule is for every record and its stories (C-20 to C-22) and test "The renamed term" promise "Every record shows the new label. No record was rewritten."
- Prevails: unclear, needs a one-line ruling. Suggest core states the exception for immutable submitted records (answers, order lines), or forms drops the snapshot.
- Owner: core 2 and forms 4.

### F16. MEDIUM. Forms expects core to declare form slots, which core never mentions, and core cannot contribute to forms' point

- Forms: `forms/05-interface-to-other-modules.md:40-47`: "Slots this specification expects, each owned by its module's workstream: ... `core.season-call`, `core.production-fields`, `core.person-fields`, `core.venue-fields`, `core.production-signup`". `forms/05-...:165`: "Notifications and record type names | 3 | Settled".
- Core: `core/05-interface-to-other-modules.md` has no contribution to `forms.slot`, no mention of the production sign-up or season call, and `core/02-scope.md:26` puts custom fields on productions and venues with workstream 5. `core/05-...:277`: "Workstream 5: Uses `core_terms` ... and `core_files` ... with its own slots and `core.file-access`" (no slots from core).
- Direction: contributing to `forms.slot` makes core know forms; `forms/05-...:153` says "core never imports it", and `found/02-1-module-manifest.md` says the core imports no module.
- Fix: decide who declares the five slots (forms declaring them with ids `forms.*`, or the host module under `uses: forms`) and say so on both sides. Also note that core's `core.production` form (production details) must surface through `core.record-tab` (F8).
- Owner: forms 4 and core 4; foundations ruling on direction.

### F17. MEDIUM. Core contributes to `communications.audience-source`, but the core never lists or imports a module

- Core: `core/05-interface-to-other-modules.md:289`: "Core contributes 'a production's team' to the point `communications.audience-source`, read from the fact `core.production-team`." Identity does the same: `ident/05-interface-to-other-modules.md:100-102` (three sources keyed `core.role-holders`, `core.ability-holders`, `core.members`).
- Foundations: `found/02-1-module-manifest.md:~76` (build checks): "a module imports from a module it does not list in `requires` or `uses`, or the core imports from any module". `core/01-overview.md:~34` (diagram): "Core never imports them". `found/02-1-module-manifest.md:Dependencies`: "`core` is always on and never listed."
- A contribution to another module's point needs a dependency in the manifest. Either communications contributes the sources (it `uses` core, which is allowed) or foundations rules that core may contribute to points of reserved later modules. Same question for identity.
- Prevails: unclear, needs a foundations ruling. Owner: foundations 1/4; core 4 and identity 4.

### F18. MEDIUM. Bounce and complaint handling is built on a queue and task that core does not list, and its status text is stale

- Foundations: `found/02-formats.md:211`: "The platform therefore declares a second queue binding, `EMAIL_EVENTS` ... consumed by the same Worker, which hands each message to core's task `core.email-events` ... It is a setup step owned by core, shown once the domain is verified ... a health check warns while the step is not done and when mail has been sent for a day with no outcome received. The domain's 'Drop suppressed recipients' option stays off."
- Core: `core/01-overview.md:52`: "The Sent to Bounced move depends on an unverified vendor capability". `core/11-sources.md:67`: "Cloudflare Email Sending reports bounces and complaints back to the Worker | Not checked against documentation". The tasks table (`core/05-interface-to-other-modules.md:199-209`) has no `core.email-events`; the setup steps (`core/06-screens.md:75-82`, "Your sender") and health checks (`core/05-...:131`, "sending domain verified, stuck deliveries, orphaned files") do not include the event-subscription step or the "no outcome received for a day" check.
- Note the paper still says it is unverified (`paper/12-build-backlog-and-glossary.md:140`), while foundations states it as a design fact. Reconcile: foundations asserts a design; core and the paper say it is a research item. At minimum core must list the task, the setup step and the health check, and the `complained` state transition (see F31).
- Owner: core 3, 4, 5; foundations to say whether it is verified.

### F19. MEDIUM. Webhook delivery mechanism does not fit the event model

- Core: `core/03-data-model.md:524`: "core listens to every event. In the batch that records the event, it adds one `queued` delivery for each active webhook subscribed to it." `core/10-questions-for-matt.md:143`: "Deliveries are recorded in the same batch as the event".
- Foundations: `found/05-states-and-rules.md:80` (E3): "A listener runs as a job in the prompt lane, in its own unit"; E4: "A listener cannot veto"; `found/02-1-module-manifest.md` events section: events are "Delivered afterwards, at least once". A listener cannot write into the announcing batch.
- Core's table of events core listens for (`core/05-interface-to-other-modules.md:108-112`) does not list "every event" for webhooks either. Also `core/10-questions-for-matt.md:140`: "a webhook carries the event's name, time and ids, plus the public title and address of the record", against `found/02-formats.md:155`: "The event's name, its time, its ids and the record's public title, and nothing else." (the extra "address" is outside the ruling; C-50 at `core/08-stories.md:99` agrees with foundations).
- Fix: either the listener creates the `queued` delivery in its own unit after the event (and the 5-minute sweep is the safety net), or ask foundations for a kit hook inside `announce`. Remove "address" from the webhook rule.
- Owner: core 2, 4, 9; foundations to confirm.

### F20. MEDIUM. Merge handler for notification preferences is not contributed

- Core: `core/03-data-model.md:390`: `core_notification_preferences.account_id` "on merge handler ... the survivor's row wins"; `:556`: "Preferences use a handler". `core/05-interface-to-other-modules.md:111`: `core.account.merged` "Nothing by event: the merge moves core's rows in its own batch, through the column declarations." `:131` lists core's contributions and has no `core.merge-handler`.
- Identity: `ident/05-interface-to-other-modules.md:158`: "`core.merge-handler` | code | Given winner and loser, the statements for rows a plain move would break".
- A `handler` column with no contribution fails the merge test ("The merged account", `core/09-test-plan.md`). Add the contribution (and list it in the interface tab).
- Owner: core 4.

### F21. MEDIUM. Starter site and content configuration differ from foundations; a "pending proof" is now proved

- Core: `core/05-interface-to-other-modules.md:248`: "Starter content lives upstream in `examples/site/` and is copied into `site/` once by the setup command." `:229`: "Whether that survives an upstream merge is being tested by the foundations proof, so a theatre-defined collection from inside `site/` is unproven." `core/11-sources.md:68`: "Under test by the foundations owned-paths proof". `:229` also puts the collection definitions "upstream in `layers/public-site/`".
- Foundations: `found/12-1-repository-and-owned-paths.md:53`: "Upstream ships `site/` as a working starter (a home page, a what's on page, a sample content page) and then never changes any file under it again. Improvements to the starter go to a separate `examples/` folder." `found/12-1-...` layout: root `content.config.ts` "UPSTREAM. Upstream's collections, plus the theatre's". `found/13-proofs.md:26`: "Theatre content collection declared in `site/content.config.ts` | Survives the merge; the built Worker serves `/news/season` from D1."
- So: starter content is shipped inside `site/` (no setup-command copy), the collections file is at the root, and the theatre-owned collection is proved. Update core 4 and the "Not verified" table, and C-40's/`The clean merge` test wording.
- Owner: core 4 and 11.

### F22. MEDIUM. Public component names are not module-prefixed

- Core: `core/05-interface-to-other-modules.md:252-268`: components `whats-on`, `season-grid`, `callout`, `hero`, `gallery`, `credits`, `setting` and so on, declared through `core.public-component` (which names a module in each entry).
- Foundations: `found/02-1-module-manifest.md:240`: "Every component's name starts with the module id in PascalCase (`FormsSlot`, `BoxOfficeSeatPicker`), so two modules cannot collide in auto-import." `found/02-formats.md:109` repeats it as a ruling.
- Names such as `Hero`, `Gallery` and `Callout` collide with Nuxt UI or a theatre's own components (the theatre's own in `site/app/components/content/` "need no entry", `core/05-...:140`).
- Fix: either component names are `PublicSiteWhatsOn`, `CoreCallout` and so on, with the short names as MDC aliases declared in the point entry, or foundations rules the exception for content components. Owner: core 4; foundations to confirm.

### F23. MEDIUM. A cancelled production is "past" only in a side note

- `core/10-questions-for-matt.md:109`: "**A cancelled production** is treated as past from the day it is cancelled, and shown as cancelled." (flagged as "beyond what you wrote".)
- `core/04-states-and-rules.md:56`: "A production is past when its last performance has ended." `core/03-data-model.md:62`: `last_ends_at` "Latest performance that is not a draft. Decides current or past". `core/08-stories.md:95` (C-46): "A production becomes past when its last performance ends". A cancelled production's performances are cancelled but not draft, so by the data model it stays current until their original end times.
- Effect: the address a cancelled production uses is undefined in the data model and test plan ("The closing night", "The revival"). Fix: state the rule in 04 and C-46 (or leave it out of Q7), and say what `last_ends_at` does for cancelled performances.
- Owner: core 3, 7.

### F24. MEDIUM. Screen inventory misses screens that other tabs require

- `core/03-data-model.md:522`: "Screen | Console, Webhooks | List with state and last success. Editor with event picker and 'send a test'. Delivery log with retry."
- `core/06-screens.md:36-73` has no Webhooks screen; its "Console: messages" group stops at Delivery health. The tab says it "lists every screen this workstream adds" (`:5`). Also absent: the credit "hide mine" control for a linked person (`core/03-data-model.md:89`: "The linked person may change their own"; no screen, ability or record type owns it) and the vocabulary create screen is only implied (C-20).
- Fix: add the screens and name the ability or ownership rule for hiding one's own credit. Owner: core 5, 6.

### F25. MEDIUM. "Season pattern" is promised and never specified

- `core/02-scope.md:14`: "Organisation settings | Time zone, locale, currency, operating-day rollover, season pattern". `paper/04-part-a-features.md:25`: "The year and season pattern: a committee year, a financial year, named seasons, or none." `paper/06-setup-branding-and-public-site.md:9`: the wizard asks for "season pattern". `ident/02-scope.md:48`: "The organisation's year pattern offers a 'current year ends on' date. Grants that expire at the year end read it."
- Core `07` has no such setting and the first-run steps (`core/06-screens.md:77-82`) do not ask for it. Identity's `core.grants.default-expiry` "year-end" has no source for the date, and box office has its own `finance.year.starts` (`bo/07-settings-and-abilities.md:68`).
- Fix: core adds one setting (committee-year end), ruled as the single source for identity's year-end expiry, or the paper and scope drop it. Owner: core 1 and 6; identity to read it.

### F26. MEDIUM. Part 4 lists omit things declared in part 2

(Related to F7 but a separate fix.) `core/05-interface-to-other-modules.md` jobs table lacks `core.send-webhook` (declared `core/03-data-model.md:519`); its events table lacks `core.webhook.paused`, `core.delivery.bounced`, `core.delivery.complained` (the last two are described only in prose at `:288`) and does not mark which events are `internal`, although `found/02-formats.md:156` requires a stated `internal: true/false` for every event on a record type whose table has a subject (`core.address.suppressed` and `core.notification.failed` would arguably be internal). Add them to the tables, as the manifest build will collect from there.
- Owner: core 4.

### F27. MEDIUM. Encrypted "internal" columns have no helper; the credentials store exists

- `core/03-data-model.md:484-485`: `core_webhooks.url` "text, encrypted ... internal"; `secret` "text, encrypted ... generated, shown once". Also `core_push_subscriptions.keys` "text, encrypted" classed personal (`:469`).
- `found/02-4-data-class-registry.md:44`: "Special category columns are encrypted by the helper ... `col.special()`". `found/02-formats.md:136`: "A manifest has a `credentials` section for keys entered in the console and stored encrypted" with `core_credentials` ("the value is never returned to a browser after it is saved"; `found/04-data-model.md`, `hint` last four characters).
- Webhook URL and signing secret fit the credentials store (masked display equals `hint`). Fix: store them as credentials keyed by the webhook id, or ask foundations for an "encrypted internal" helper. Owner: core 2; foundations.

---

## LOW

### F28. LOW. Same event named two ways

`core/05-interface-to-other-modules.md:174`: notification type `core.delivery.failed` ("A transactional delivery fails for good") against `core/05-...:101` and `core/04-states-and-rules.md:159`: event `core.notification.failed` for the same occurrence. Pick one record noun (the table is a delivery, so `core.delivery.failed` for both).

### F29. LOW. `complained` has no transition

`core/03-data-model.md:368`: "The state list also holds `complained`". `core/04-states-and-rules.md` delivery table and diagram (`:121-152`) have no `Sent to Complained` move, and the data-model state list (`:355`) lists `bounced` but the sentence at `:368` is the only mention. Add the move and the suppression it causes (`complaint` is a suppression reason at `:457`).

### F30. LOW. Cancelling a production cannot cancel its draft performances

`core/04-states-and-rules.md:55`: "Cancelling a production cancels every performance that has not started". The performance table (`:76-83`) has no `Draft to Cancelled` move (cancel is only from Scheduled). Say draft performances are left as draft or deleted.

### F31. LOW. Stale "departs from the paper" wording; the paper has been amended

`core/02-scope.md:57`: "The paper's Part A lists 'on sale' as a performance state, so this is raised as question 1." `core/04-states-and-rules.md:95`: "This departs from the paper." `core/10-questions-for-matt.md:23`: "The paper's Part A gives a performance the states draft, on sale, cancelled". Yet `paper/04-part-a-features.md:46` already says "a state (draft, scheduled, cancelled, completed). Whether it is on sale is not core's to say". The paper's own status tab is also stale: `paper/11-design-stage-questions-and-status.md:124` ("departs from this paper's Part A, which will be amended once you confirm") and `:33` (C1's alternative column), `:19` ("Its data tables are being rewritten into the Foundations layout", done per `core/01-overview.md:51`), `:127` ("Foundations has been asked to add a flag", done: `found/02-formats.md:154`).

### F32. LOW. Test plan still hedges on a decided question

`core/09-test-plan.md:96` (The erased director): "Their name is not findable in the archive search unless question 5's answer keeps printed names." Question 5 is decided (printed names stay unless the person asks): `core/10-questions-for-matt.md:15`.

### F33. LOW. Whether `/whats-on` and `/shows` are reserved

`found/02-formats.md:157`: "`/whats-on` and `/shows` are core-owned address prefixes; `/archive` is replaced by `/shows`. A theatre may still override those pages from `site/`." `core/05-interface-to-other-modules.md:193` and `ui/01-scope.md:63`: "neither is a reserved prefix". Same practical rule (overridable), different words. Align the wording so no one adds them to the reserved-prefix check.

### F34. LOW. Record type declarations that do not fit the format

`core/05-interface-to-other-modules.md:23`: `core.branding` has table "none: one fixed record". `:21`: `core.file` parent "the file's owner, answered by the resolver". `found/02-3-abilities-registry.md` and `found/02-formats.md:181`: a record type has a `table` and "at most one parent type". Foundations needs to accept a tableless record type and a resolver-defined parent, or core states a different declaration.

### F35. LOW. Venue and space cannot be a grant scope as identity expects

`ident/05-interface-to-other-modules.md:194`: "The record types that can scope a grant (a production, a venue, a space) belong to workstream 3"; `:222`: core must "mark production and venue as grantable record types". `core/07-settings-and-abilities.md:~110-111`: `core.venue.manage` and `core.closure.manage` act on "site", so a venue-scoped grant (for example a hirer's venue manager) is impossible. State the intent: site-wide only, or add `on: core.venue`.

### F36. LOW. Counts and totals

- `core/01-overview.md:28`: "Eight requests went back to the foundations thread and all eight have been ruled on." Foundations records nine asked by core: realm by row, class from a parent row, colour kind, weekly task (`found/02-formats.md:130-134`), `/files` (`:135`), webhooks and public addresses (`:154,157`), and `real` ("Raised by core domain", `:161`), plus `core.vocabulary` points. Recount or reword.
- `core/01-overview.md:21`: "Core, always on, with 26 tables." The module `core` has 12 (foundations) + 17 (identity) + 26 (this workstream) + 3 (interface, `ui/02-data-model.md`). `paper/12-build-backlog-and-glossary.md:107-116` totals "109" without the interface's 3 tables. Say "26 core-domain tables".
- `core/01-overview.md:28`: "Three services every module calls: files, notifications, and brand"; `core/05-...` actually lists five service groups (programme, vocabularies, files, notifications, brand and organisation).

### F37. LOW. Backlog puts two "Later" stories in the phase-2 build order

`paper/12-build-backlog-and-glossary.md:41`: phase 2, order 1: "C-20 to C-22 (vocabularies), C-23 to C-26 (files)". C-22 (merge terms) and C-26 (storage library) are "Later" (`core/08-stories.md:44,53`; the backlog row `:11` says 43 first release). Exclude them like C-44 is excluded at `:43`.

### F38. LOW. Broken code-span rendering

`core/06-screens.md:15`: ``/whats``-``on/<slug> while current, /shows/<slug> once past`` (backticks split inside the word). The same appears in `core/10-questions-for-matt.md:100,101,104,105` and `ui/05-1-shells-and-navigation.md:89`. Re-render as one code span.

### F39. LOW. What's-on filters and component list differ from the paper

`paper/04-2-module-catalogue.md:39`: "What's on, with filters by season, venue and type." `core/06-screens.md:14`: "Filter by category and month"; the `whats-on` component has `category`, `season`, `limit`, `layout` and no venue. `paper/06-setup-branding-and-public-site.md:30` lists "a committee list" among ready-made components; core has none (governance is later). Align.

### F40. LOW. First-run wizard steps differ

`ui/05-3-key-journeys.md:150`: "Five steps: theatre name and type, time zone and currency, brand colour and logo with a live preview of all three shells, modules to switch on, sample data or a clean start." `core/06-screens.md:77-82`: four core steps (theatre, look, first venue, sender), no "type", no sample data. `paper/06-...:11`: "A demo mode fills the site with sample productions". Neither core nor interface says who provides demo data. Also the language setting moves with F2.

### F41. LOW. "All or nothing" run of 200 performances against the unit limit

`core/09-test-plan.md:31` (The long run): "A run that would create 200 performances ... Saved in batches that respect the 90-parameter limit, all or nothing." `found/05-states-and-rules.md:67` (U6): "A unit has a limit on statements ... Work over the limit must be a job that proceeds in chunks, each its own unit, each safe to repeat." Chunks cannot be all-or-nothing. State the kit limit, or make C-04's "one batch or none" a chunked, repeatable job with a clear partial outcome.

### F42. LOW. Booking action per date against a production-level button

`core/06-screens.md:90` (wireframe caption): the booking action is on each date. `ui/05-3-key-journeys.md:39`: "Production page. Dates are listed with availability in words ... One button: Book tickets", then step 2 "Choose a performance, if there is more than one". Core's `booking-button` (`production` or `performance`) can do both, but the two descriptions show different page designs. Interface and core should settle on one (per date, with a production-level button only where there is a single date).

---

## Checked and consistent

- 26 core-domain tables, 18 with prefixes and 8 keyed by their own columns; every prefix (`sea prd crd perf ven spc pla clo trm fil ntf ndl inb ntd ntt psh whk whd`) matches `found/06-interface-to-other-modules.md:66`, including the withdrawn `psl adv pfa`. Prefix lengths meet the "two to four lower-case letters" rule. (Note: `core_webhook_deliveries` has the prefix `whd` in group text and the index but its own heading line omits it, `core/03-data-model.md:493`.)
- 51 stories (43 first, 8 later, 6 added late), 63 named test cases, and 14 points all count correctly; the 14 points equal the core row in the foundations index.
- Record types `core.season/production/performance/venue/space/file/vocabulary/branding` match the foundations index; the facts (`core.production-team` standing) match identity's expectation.
- Performance states draft/scheduled/cancelled/completed agree with box office, the paper's Part A and the glossary; sale state is box office's.
- Contributors named by box office (`core.booking-action`, `core.change-impact`, `core.change-guard`), the events it hears (`cancelled`, `rescheduled`, `completed`), `operatingDayOf` and `dayBounds`, the suppression list and `core_terms` references agree with core.
- Identity's three services `addressFor`, `holdersOf`, `mergeAccounts` and core's use of them (`notifyHolders`, merge by column declarations) agree; identity declares its events `internal: true`, which fits webhooks.
- Forms: `listTerms`, `assertTerm`, `core.vocabulary.manage`, `x.` vocabulary keys, `core_files` slots, `core.file-access`, `core.vocabulary`, `core.file-slot`, `core.notification-type` agree (apart from F15, F16).
- Foundations rulings applied correctly: realm by row, class from the parent row (one hop for terms), `real` for latitude and longitude, `colour` and `time` setting kinds, weekly tasks, `_content_*` tables, `/files` reserved, `internal` events for webhooks, bulk lane for notification types and for `core.send-webhook`, scoped ids, append-only split into drafts and published templates.
- Setting and ability names follow the naming patterns (three kebab-case segments; `<module>.<record>.<verb>`); quotable settings are all `public`; only `custom` kind for social links with a stated reason.
- British English spelling throughout the area (no US spellings found).
- Mermaid diagrams: production, performance and delivery state diagrams agree with their tables (apart from F29 and F30). Image captions match the prose around them.
- Operating-day rule (04:00 rollover, 00:00 to 08:00) matches foundations' `day-start` value and the paper's Part A (key names differ, F2).
- Matt's decisions (Q1 to Q9) are reflected in the overview, data model, stories and settings (apart from the missing setting in F7).

## Noticed outside my area (for the owning reviewers, not verified further)

- `ident/07-settings-and-abilities.md:3` says "16 abilities" and `:122` says "That makes 17 rows".
- `ui/04-interface-to-other-modules.md` reads `core.module.switched`; foundations announces `core.module.enabled` and `core.module.disabled` (`found/06-interface-to-other-modules.md`, events table).
- `bo/06-screens.md:~24` uses `/orders/<token>`, which is not a reserved prefix (`found/12-1-repository-and-owned-paths.md:74`), so a theatre page could collide with it.
