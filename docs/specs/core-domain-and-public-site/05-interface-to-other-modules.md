# 4. Interface to other modules

## The two modules

| Module | Id | Requires | Can be switched off | Owns |
| --- | --- | --- | --- | --- |
| Core | `core` | nothing | No | Everything in part 2 |
| Public site | `public-site` | `core` | Yes | The public pages, feeds and content components. No tables. |

This part uses the foundations draft's four mechanisms and no others: services, events, points and facts. Core declares one fact, core.production-team, described in part 6.

## Record types core declares

| Record type | Table | Parent | Owner column |
| --- | --- | --- | --- |
| `core.season` | `core_seasons` | none | none |
| `core.production` | `core_productions` | none | none |
| `core.performance` | `core_performances` | `core.production` | none |
| `core.venue` | `core_venues` | none | none |
| `core.space` | `core_spaces` | `core.venue` | none |
| `core.file` | `core_files` | the file's owner, answered by the resolver | none |
| `core.vocabulary` | `core_vocabularies` | none | none |
| `core.branding` | none: one fixed record, `core.branding/site` | none | none |

A production's parent is not its season. A grant on a production covers its performances, and through them another module's orders or shifts. A season groups productions for the public and carries no authority.

## Services

Named exports of `layers/core/server/services.ts`, imported as `#modules/core`. A service that writes returns statements for the caller's unit of work and never commits.

### Programme

| Service | Returns or does |
| --- | --- |
| `getProduction(id)`, `getProductionBySlug(slug)` | One production with its category, season and state. Follows an old slug to the current one. |
| `listProductions({ state, seasonId, from, to })` | Productions with at least one performance in the window. |
| `getPerformance(id)` | One performance with its production, venue, space and capacity. |
| `listPerformances({ productionId, from, to, state, spaceId })` | Performances in a window, in time order. |
| `listPerformancesOnDay(operatingDay)` | Everything on one operating day. Front of house uses it for "tonight". |
| `capacityOf(performanceId)` | The performance's capacity: its own if set, else its space's, else uncapped. |
| `operatingDayOf(instant)`, `dayBounds(operatingDay)` | The calendar helper every module uses, so the rollover rule is written once. |
| `isSpaceFree(spaceId, from, to)` | True if no scheduled performance or blocking closure overlaps. The Spaces module will add its bookings through the point `core.space-busy`. |

### Vocabularies

| Service | Returns or does |
| --- | --- |
| `listTerms(vocabularyKey, { includeRetired })` | Terms in the vocabulary's order. Pickers leave retired terms out. |
| `getTerm(id)` | One term, following `merged_into_id`. Works for a retired term, so old records still show a label. |
| `assertTerm(id, vocabularyKey)` | A statement predicate that the term is live and belongs to that vocabulary. Callers put it on their own insert. |

### Files

| Service | Returns or does |
| --- | --- |
| `beginUpload({ owner, slot, name, size })` | A pending row and a one-use upload address. |
| `attachFile(fileId, { owner, slot })` | Statements that move a ready file onto a record, replacing the old one in a single-file slot. |
| `fileUrl(fileId, { size })` | A public address for a public file, or a short-lived signed one. `size` is one of the named image sizes. |
| `deleteFile(fileId)`, `deleteFilesOf(owner)` | Statements that mark files deleted. The owner's deletion calls the second. |
| `eraseFilesOf(owner)` | For erasure handlers: marks deleted with no waiting period. |

Named image sizes: `thumb` 320, `card` 640, `page` 1280, `full` 1920 pixels wide, and `social` 1200 by 630. Nothing else can be requested, which keeps the count of distinct resizes small and predictable (see Sources for the pricing this guards against).

### Notifications

| Service | Returns or does |
| --- | --- |
| `notify(typeKey, { to, subject, variables, dedupeKey })` | Statements that record one notification for each account in `to` and its deliveries. |
| `notifyAddress(typeKey, { address, locale, subject, variables, dedupeKey })` | The same for an address with no account, such as a guest booking. Email only. |
| `notifyHolders(typeKey, { ability, record, ... })` | Sends to everyone who holds an ability on a record, resolved by workstream 2's service. "Tell the duty managers" without naming a role. |
| `previewNotification(typeKey, channel, variables)` | The rendered subject and body, for the template screen and for tests. |

### Branding and organisation

| Service | Returns or does |
| --- | --- |
| `getBrand()` | The theatre's name, the derived colour shades for light and dark, fonts, file addresses for each logo slot, and the revision number. Workstream 6's shells and every email, ticket and PDF read this and nothing else. |
| `getOrganisation()` | Time zone, language, currency, rollover hour, contact details. |

## Events core announces

An event's payload carries ids and times, never names or free text.

| Event | When | Payload beyond the record id |
| --- | --- | --- |
| `core.season.published`, `core.season.archived` | The move happens |  |
| `core.production.published` | Draft or Withdrawn to Published |  |
| `core.production.updated` | A public field changes on a published production | The names of the changed fields |
| `core.production.withdrawn`, `core.production.cancelled` | The move happens | The reason code |
| `core.performance.scheduled` | Draft or Cancelled to Scheduled | `reinstated`: true or false |
| `core.performance.rescheduled` | The time changes on a scheduled performance | Old and new start and end |
| `core.performance.moved` | The venue or space changes | Old and new space |
| `core.performance.capacity-changed` | The capacity changes | Old and new capacity |
| `core.performance.cancelled` | The move happens | The reason code |
| `core.performance.completed` | The task marks it complete | The operating day |
| `core.venue.archived`, `core.space.archived` | The move happens |  |
| `core.closure.created`, `core.closure.removed` | A closure is saved or deleted | Scope and times |
| `core.term.retired`, `core.term.merged` | The move happens | The vocabulary key, and the term merged into |
| `core.file.ready`, `core.file.deleted` | The move happens | The owner and slot |
| `core.branding.changed` | The brand is saved | The new revision |
| `core.notification.failed` | A transactional delivery reaches Failed | The type key and channel |
| `core.address.suppressed` | An address joins the suppression list | The reason. No address. |

Reinstating a performance announces `core.performance.scheduled` with `reinstated` set, not a separate event, so a module that handles scheduling handles reinstatement without extra work.

## Events core listens for

| Event | From | What core does |
| --- | --- | --- |
| `core.setting.changed` | Core's settings service | If the key is the time zone or the rollover hour, queues the job that recomputes operating days. If it is quotable, raises the public revision. |
| `core.account.merged` | Workstream 2 | Nothing by event: the merge moves core's rows in its own batch, through the column declarations. Listed so the dependency is visible. |
| Every event in the table above | Core | The public site module listens to raise the public revision and clear cached pages. |

## Points core offers

Each works with nothing contributed.

| Point | Kind | A contributor supplies | Used for |
| --- | --- | --- | --- |
| `core.change-impact` | code | Given a record and a proposed change, counts in plain words | The confirmation before a cancel, withdraw, reschedule or move |
| `core.change-guard` | code | Given the same, allow or refuse with a reason | Stopping a change another module cannot survive |
| `core.delete-guard` | code | Given a record, allow or refuse | Stopping deletion of a draft something else points at |
| `core.space-busy` | code | Given a space and a window, the times it is taken | The Spaces module's bookings in the overlap check |
| `core.booking-action` | code | Given a performance, a label, a link and a state (`available`, `limited`, `sold-out`, `not-yet`, `closed`) | The booking button. Box office contributes. With none, the performance's external booking link is used. With neither, no button shows. |
| `core.production-section` | data | A component, a position and an ability | Extra panels on the console production page (Box office's sales summary, Front of house's rota) |
| `core.notification-channel` | code | A channel id, a `send()` and a way to tell if an account can receive | Email and inbox ship with core. Push, and later others, plug in here. |
| `core.holiday-feed` | code | Given a year and a country, a list of dated names | Public holidays. Core ships a contributor for the United Kingdom's published bank-holiday feed. |
| `core.file-access` | code | Given a record and an account, whether they may read its files | Files with `record` access |
| `core.public-component` | data | A component name, its module, its properties and a one-line description | Components a content page may use. See below. |

Core contributes to the foundations points `core.navigation`, `core.setup-step` (name and time zone, brand, first venue, sender address), `core.health-check` (sending domain verified, stuck deliveries, orphaned files), `core.record-resolver` and `core.erasure-handler` (files).

### `core.public-component`

Workstream 6 asked that one workstream own the shape of public components, and proposed this one. Agreed. The rules:

- **Declared by a module.** Each entry names the module, so the build knows where it came from.
- **Gone cleanly when its module is off.** A page that uses a component whose module is switched off renders nothing in its place and logs a warning to the site-readiness screen. It never errors.
- **Unknown name fails the build.** A page using a component no module declares fails `bun run check`, the same way an unknown setting does.
- **A theatre's own components need no entry.** Anything in `site/app/components/content/` is the theatre's and is always available.
- **Bound by workstream 6's rules for every screen.**

## What a module declares to core

| Declaration | Fields |
| --- | --- |
| Vocabulary | Key, ordering, locked, term class, starting terms |
| File slot | Record type, slot name, one or many, accepted types, size-limit setting, default access, cleaning, whether alt text is required |
| Notification type | Key, topic, category (`transactional` or `optional`), side (`audience` or `member`), allowed channels, default channels, variables with their types, whether it may join a digest, coalescing window, default sender |
| Notification topic | Key, side, a label shown on the preferences screen |

By the foundations thread's ruling, each of these is a data point that core owns and a module contributes entries to: `core.vocabulary`, `core.file-slot`, `core.notification-type` and `core.notification-topic`. The rule for everyone is that anything one module lets others declare is a point.

### Core's own file slots

| Record type | Slot | Holds | Access | Limit |
| --- | --- | --- | --- | --- |
| `core.production` | `poster` | One image | Public | Image limit |
| `core.production` | `banner` | One image | Public | Image limit |
| `core.production` | `gallery` | Many images | Public | Image limit |
| `core.production` | `programme` | One PDF | Public | Document limit |
| `core.production` | `working` | Many files of any accepted type | Record | Document limit |
| `core.venue` | `photo` | Many images | Public | Image limit |
| `core.space` | `plan` | One image or PDF | Signed in | Document limit |
| `core.branding` | `logo`, `logo-dark`, `favicon`, `social-image`, `email-header` | One image each | Public | Brand limit |

### Core's own notification types

| Type | Category | Side | Sent when |
| --- | --- | --- | --- |
| `core.credit.added` | Optional | Member | A credit is linked to the person's account (question 5) |
| `core.delivery.failed` | Transactional | Member | A transactional delivery fails for good. Sent to holders of `core.delivery.read`. |
| `core.digest` | Follows its contents | Both | A digest is due |
| `core.test` | Transactional | Member | Someone presses "send me a test" on a template |

Core deliberately sends nothing to audiences about cancelled or moved performances. Only Box office knows who holds a ticket, so that message is Box office's to send.

## Routes

All under `/api/core/` or `/api/public-site/`, written with `defineRoute`.

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/core/branding` | Public | The brand as data |
| `GET /api/core/branding/theme.css` | Public | The derived colours as a stylesheet. The revision is in the address so it can be cached for a year. |
| `GET /api/public-site/productions`, `/performances`, `/seasons`, `/venues` | Public | Published programme data, for the theatre's own pages and for others to read |
| `GET /whats-on.ics` | Public | A calendar feed of scheduled performances |
| `GET /files/<id>/<size>` | By the file's access | The bytes |
| Everything else under `/api/core/` | By ability | The console screens in part 5 |

**Reserved address prefixes this workstream needs** beyond those workstream 6 has agreed: `/files`. The public content routes (`/whats-on`, `/seasons`, `/shows`, `/venues`, `/news`) are ordinary pages a theatre may override in `site/app/pages/` and are not reserved.

## Jobs and tasks

| Name | Kind | Does |
| --- | --- | --- |
| `core.send-notification` | Job | Sends one delivery |
| `core.check-file` | Job | Checks and cleans one upload |
| `core.purge-file` | Job | Removes one file's stored bytes |
| `core.recompute-days` | Job | Recomputes operating days after a settings change |
| `core.sweep-deliveries` | Task, every 5 minutes | Re-queues stuck deliveries, releases stuck sends |
| `core.complete-performances` | Task, every 5 minutes | Marks ended performances complete |
| `core.send-digests` | Task, hourly | Sends digests due at this hour in the theatre's time zone |
| `core.sweep-files` | Task, daily at 03:00 | Rejects stale uploads, purges files past their date |
| `core.reconcile-files` | Task, weekly | Finds stored bytes with no row |
| `core.import-holidays` | Task, weekly | Refreshes public holidays from the feed |
| `core.archive-seasons` | Task, daily at 03:00 | Archives ended seasons, if the setting allows |

Weekly tasks use the form the foundations thread added on request: `task({ weeklyOn: { day: 'mon', at: '06:00' } })`.

## Content structure in the fork

The theatre owns `site/`. Upstream never writes there after the first copy, so merges do not conflict.

| Path | Holds |
| --- | --- |
| `site/content/index.md` | The home page |
| `site/content/<name>.md` | Any page: about, visit, get involved, contact |
| `site/content/news/<date>-<slug>.md` | News posts |
| `site/content/policies/<name>.md` | Policies, which quote settings |
| `site/content/navigation.yml` | The public header and footer links (question 4) |
| `site/content/redirects.yml` | Old addresses and where they now go |
| `site/app/components/content/` | The theatre's own components for use in pages |
| `site/app/pages/` | Whole pages that replace a built-in public route |
| `site/public/` | Static files |

The collection definitions live upstream in `layers/public-site/` and point at `site/content/` with Nuxt Content's `source.cwd` option. A theatre adds collections of its own in a theatre-owned site/content.config.ts that upstream's file merges in. Whether that survives an upstream merge is being tested by the foundations proof, so a theatre-defined collection from inside `site/` is unproven (see Sources).

**Front matter every page accepts:**

| Field | Type | Meaning |
| --- | --- | --- |
| `title` | text, required | Page title |
| `description` | text | Shown to search engines and on social cards |
| `image` | path | Social card image. Falls back to the brand's social image. |
| `layout` | one of `default`, `wide`, `landing` | Page layout |
| `placeholder` | boolean | The page still holds starter text. Listed on the site-readiness screen and marked `noindex`. |
| `draft` | boolean | Built in preview, left out of production |
| `noindex` | boolean | Ask search engines to skip it |
| `updated` | date | Shown on policies |

News posts add `date`, `author` (a free name, the theatre's choice to give) and `summary`.

**Quoting a setting:** `:setting{key="box-office.orders.seat-cap"}`, the form the foundations draft fixes. Proscenium writes these as `{{KEY}}`, which Nuxt Content's markdown reads as a data binding, so the component form avoids a clash.

**Starter content** lives upstream in `examples/site/` and is copied into `site/` once by the setup command. Every starter page has `placeholder: true`. Proscenium's decision 0051 uses the same marker for the same reason.

**The content database.** Nuxt Content on Workers needs a D1 database. This specification assumes it shares the theatre's one database under the binding `DB`, with its tables left alone by the migration journal. That is a foundations matter and has been sent there.

## Public components core and the public site declare

| Component | Properties | Shows |
| --- | --- | --- |
| `whats-on` | `limit`, `category`, `season`, `layout` | Upcoming published productions |
| `season-grid` | `season` (slug or `current`) | One season's productions |
| `production-card` | `slug` | One production |
| `performance-list` | `production` | Dates, times, access features and a booking action for each |
| `booking-button` | `production` or `performance` | The booking action, from `core.booking-action` |
| `credits` | `production`, `section` | The credits list |
| `advisories` | `production` | Content and technical warnings, behind a "show" control if the theatre chooses |
| `archive-search` | `from`, `to` | Search across past productions |
| `venue-info` | `venue` | Address, map link, access and travel text |
| `news-list` | `limit` | Recent news posts |
| `setting` | `key` | One quotable setting |
| `contact-details`, `social-links` | none | From organisation settings |
| `callout`, `hero`, `gallery` | Their content | Layout pieces with no data |

## What this workstream needs from the others

| From | Need |
| --- | --- |
| Foundations | The three data-format points in part 2. Manifest entries for vocabularies, file slots, notification types and topics. A colour kind for settings. A weekly task. A ruling on the content database. Proof that `site/` can add content collections. |
| Workstream 2 | `core_accounts` and its preferred, verified address for each side. A service that resolves "everyone holding this ability on this record". Merge moves core's rows by column declaration. Guests who book without an account are reachable by `notifyAddress`. |
| Workstream 4 | A contributor to `core.booking-action`, `core.change-impact` and `core.change-guard`. Agreement that sale state is Box office's (question 1). Audience messages about cancelled and moved performances. |
| Workstream 5 | Uses `core_terms` for reusable option lists and `core_files` for uploads, with its own slots and `core.file-access`. |
| Workstream 6 | The shells read `getBrand()`. The expressive treatment stays in the public shell, as its note says. `/files` joins the reserved prefixes. |
