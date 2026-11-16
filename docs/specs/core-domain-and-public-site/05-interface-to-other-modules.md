# 4. Interface to other modules

## The two modules

| Module | Id | Requires | Can be switched off | Owns |
| --- | --- | --- | --- | --- |
| Core | `core` | nothing | No | Everything in part 2 |
| Public site | `public-site` | `core` | Yes | The public pages, feeds and content components. No tables. |

This part uses the foundations format's four mechanisms and no others: services, events, points and facts. Core declares one fact, `core.production-team`, described in part 6.

**With the public site switched off**, `/whats-on`, `/shows` and the other public programme pages answer "not found", and the feeds and open data with them. The two prefixes stay core's, so nothing else can take them. Core's console, its services and the brand keep working, because every other module needs them.

## Record types core declares

| Record type | Table | Parent | Owner column | Can scope a grant |
| --- | --- | --- | --- | --- |
| `core.season` | `core_seasons` | none | none | No |
| `core.production` | `core_productions` | none | none | Yes |
| `core.performance` | `core_performances` | `core.production` | none | Through its production |
| `core.venue` | `core_venues` | none | none | Yes |
| `core.space` | `core_spaces` | `core.venue` | none | Through its venue |
| `core.file` | `core_files` | From a resolver, which returns the owner's type and id, or nothing | none | No |
| `core.vocabulary` | `core_vocabularies` | none | none | Yes |
| `core.branding` | No table. One fixed record id, `site`. | none | none | No |

The foundations format accepts both unusual rows, by its ruling of 16 November 2026: a record type may declare no table with a fixed list of record ids, and a parent may come from a resolver.

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
| `capacityOf(performanceId)` | The house capacity of one performance: its own if set, else its space's, else uncapped. |
| `spaceCapacity(spaceId)` | The space's own capacity, or uncapped. Box office compares a seating plan or a pool against it. |
| `operatingDayOf(instant)`, `dayBounds(operatingDay)` | The calendar helper every module uses, so the day-start rule is written once. They read the foundations settings `core.locale.time-zone` and `core.locale.day-start`. |
| `isSpaceFree(spaceId, from, to)` | True if no scheduled performance or blocking closure overlaps. For showing, never for deciding a write. |
| `assertSpaceFree(spaceId, from, to)` | A statement predicate for the same test, which a caller puts on its own write. See "Agreed for the Spaces module". |

Three more services read closures, added on 16 November 2026 at the Spaces module's request, so that no module works out venue and whole-theatre scope for itself:

| Service | Returns or does |
| --- | --- |
| `listClosures({ from, to, spaceId, venueId, blocking })` | Closures and public holidays overlapping the window, in time order. With `spaceId`, only those that cover that space: a closure of the space, of its venue, or of the whole theatre. With `venueId`, those of the venue or the whole theatre. With `blocking: true`, only those that block performances. Each carries its `scope`, one of `space`, `venue`, `site`. |
| `closureSpaceIds(closureId)` | The ids of the active spaces one closure covers: one space, every space of a venue, or every space. For showing and for small sets. |
| `closureSpaces(closureId)` | A statement fragment, like `assertSpaceFree`: a subquery selecting the same space ids, which a caller places in its own set-wise write. A write over everything a closure covers uses this, never a list of ids read beforehand. |

A closure of a venue covers spaces added to that venue later, because the scope is worked out when asked and is not stored.

**Capacity has one owner for each level.** Core owns the house capacity of a performance, the `capacity` column, changed with `core.performance.schedule`. Box office owns how that house is divided into pools and seats. The total Box office puts on sale may not exceed `capacityOf()` unless its own override allows. Lowering the house capacity goes through `core.change-guard`, where Box office refuses a figure below what is held or sold, and it announces `core.performance.capacity-changed`.

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

**Files the server makes.** Added on 16 November 2026; the identity module's data download (ID-15) is the first user.

| Part | What is specified |
| --- | --- |
| The slot | A file slot may declare `source: 'server'`. Nobody can upload into it: `beginUpload` refuses. Only such a slot may accept JSON, ZIP or CSV, because those types are never taken from a person. |
| Making the file | `storeFile(unit, { slot, ownerType, ownerId, bytes, mediaType, title?, expiresAt? })`, inside the caller's unit of work. The file is ready at once, with no cleaning step and no uploader. |
| Expiry | With `expiresAt`, the row and the bytes are removed once the time passes, by the same sweep that clears deleted files, without the deleted-retention wait. `core.file.deleted` is announced as for any file. |
| Who may read it | A contribution to `core.file-access` is keyed by the owning record type and supplies `canRead(actor, record, file)`. Core asks it on every request for a private file. With no contribution for the record type, a private file answers not found, so its existence is not revealed. An upload aimed at a server slot is refused with \`core.files.not-uploadable\`. |
| How it is served | A record's private files are served with `Cache-Control: private, no-store`, so no shared cache or browser history keeps a copy. |

Named image sizes: `thumb` 320, `card` 640, `page` 1280, `full` 1920 pixels wide, and `social` 1200 by 630. Nothing else can be requested, which keeps the count of distinct resizes small and predictable (see Sources for the pricing this guards against).

### Notifications

| Service | Returns or does |
| --- | --- |
| `notify(typeKey, { to, subject, variables, dedupeKey, senderKey })` | Statements that record one notification for each account in `to` and its deliveries. `senderKey` is optional. |
| `notifyAddress(typeKey, { address, locale, subject, variables, dedupeKey })` | The same for an address that has no account yet. Email only. |
| `notifyHolders(typeKey, { ability, record, ... })` | Sends to everyone who holds an ability on a record, resolved by the identity module's `holdersOf`. "Tell whoever runs front of house" without naming a role. |
| `previewNotification(typeKey, channel, variables)` | The rendered subject and body, for the template screen and for tests. |
| `emailReachability(accountIds, side)`, `deliveryCounts(subjectType, subjectId)` | For the Communications module. See "Agreed for the Communications module". |

**When `notifyAddress` is right.** The identity specification rules that every person a module records is an account, and that someone who books as a guest is an unclaimed account, reached by `notify`. So `notifyAddress` is only for a send before any account exists: a sign-in link to an address not yet known, or the confirmation of a mailing-list sign-up. A desk sale with no account sends nothing.

**A variable that carries a secret.** Some messages carry something that works like a key: a sign-in link, an invitation link, a reset code. A notification's variables are otherwise kept in clear in its row, so a type declares such a variable with the kind `sealed`, and these rules follow. They were decided on 16 November 2026, when the identity build's invitation needed them.

| Rule | What it means |
| --- | --- |
| Declared, not guessed | A variable is sealed because its type says so. `notify` and `notifyAddress` both accept one, and refuse a sealed value passed under a variable not declared sealed. |
| Email only | A type with a sealed variable allows the email channel and nothing else: no inbox item, no push, no digest, no coalescing, and it never reaches a webhook. Registering such a type with another channel is refused at start-up. |
| Kept encrypted, apart | Sealed values are kept in `core_notifications.sealed_variables`, encrypted with the core key like a webhook's secret, and never in the `variables` column. |
| Cleared when done | The column is set to null in the same unit of work that moves the email delivery to sent, failed or skipped (a suppressed address is a skip). A bounce or a complaint only ever follows sent, so the value has gone by then. A sweep clears any left after seven days. A cleared notification is never sent again: a further attempt is skipped with the reason erased, and the caller issues a new one. |
| Never shown | The console, the delivery log, the preview, the audit trail, events and logs show the variable's name and the word "hidden", never its value. The rendered message is not stored. |
| The caller keeps the lifetime | Core does not know when a link expires. The module that issues it sets the expiry, and should issue links that are spent on first use where it can. |

So a module need not hold a secret-bearing send in a job of its own, or use `notifyAddress` for someone who has an account: it calls `notify` with a type that declares the variable sealed. `notifyAddress` remains only for a send before any account exists.

**The suppression list applies to every email, transactional or not.** An address that hard-bounced or complained is skipped whatever the type, and the delivery records why.

### Branding and organisation

| Service | Returns or does |
| --- | --- |
| `getBrand()` | The theatre's name, the derived colour shades for light and dark, fonts, file addresses for each logo slot, and the revision number. The interface's shells and every email, ticket and PDF read this and nothing else. |
| `getOrganisation()` | The theatre's name, time zone, language, currency and day start, read from the foundations settings, with core's own contact details, legal name and year end. One call, so no module reads the keys itself. |

## Events core announces

An event's payload carries ids and times, never names or free text. "Internal" is the foundations flag: an internal event is never offered to a webhook.

| Event | When | Payload beyond the record id | Internal |
| --- | --- | --- | --- |
| `core.season.published`, `core.season.archived` | The move happens |  | No |
| `core.production.published` | Draft or Withdrawn to Published |  | No |
| `core.production.updated` | A public field changes on a published production | The names of the changed fields | No |
| `core.production.withdrawn`, `core.production.cancelled` | The move happens | The reason code | No |
| `core.performance.scheduled` | Draft or Cancelled to Scheduled | `reinstated`: true or false | No |
| `core.performance.rescheduled` | The time changes on a scheduled performance | Old and new start and end | No |
| `core.performance.moved` | The venue or space changes | Old and new space | No |
| `core.performance.capacity-changed` | The capacity changes | Old and new capacity | No |
| `core.performance.cancelled` | The move happens | The reason code | No |
| `core.performance.completed` | The task marks it complete | The operating day | No |
| `core.venue.archived`, `core.space.archived` | The move happens |  | No |
| `core.closure.created`, `core.closure.removed` | A closure is saved or deleted | Scope and times | No |
| `core.term.retired`, `core.term.merged` | The move happens | `termId` and `vocabulary` for both, and `intoId` for a merge. `core.term.merged` is declared from the first release so listeners can be written against it, and is first announced when merging terms ships (C-22, later). | No |
| `core.file.ready`, `core.file.deleted` | The move happens | The owner and slot | Yes |
| `core.branding.changed` | The brand is saved | The new revision | No |
| `core.delivery.failed` | A transactional delivery reaches Failed | The type key and channel | Yes |
| `core.delivery.bounced`, `core.delivery.complained` | Cloudflare reports a hard bounce or a complaint | The notification id and the account id | Yes |
| `core.address.suppressed` | An address joins the suppression list | The reason. No address. | Yes |
| `core.webhook.paused` | The system pauses a failing webhook | The count of failures | Yes |

"Rescheduled" always means the time and "moved" always means the place. Every other specification uses the two words the same way.

Reinstating a performance announces `core.performance.scheduled` with `reinstated` set, not a separate event, so a module that handles scheduling handles reinstatement without extra work.

## Events core listens for

| Event | From | What core does |
| --- | --- | --- |
| `core.setting.changed` | The foundations settings service | If the key is `core.locale.time-zone` or `core.locale.day-start`, queues the job that recomputes operating days. If it is quotable, raises the public revision. |
| `core.account.merged` | The identity module | Nothing by event. The merge moves core's rows in its own batch, through the column declarations and core's one merge handler, for notification preferences. Listed so the dependency is visible. |
| Every event not marked internal | Any module | The webhook listener, declared with `on: 'deliverable'`, a form only core may use. It runs in its own unit on the prompt lane and adds one queued delivery for each active webhook subscribed to the event. |
| Every event in the table above | Core | The public site module listens to raise the public revision and clear cached pages. |

Core also consumes the queue `EMAIL_EVENTS`, which is not an event in this sense: see "Bounces and complaints" below.

## Points core offers

Each works with nothing contributed.

| Point | Kind | A contributor supplies | Used for |
| --- | --- | --- | --- |
| `core.change-impact` | code | Given a record and a proposed change, counts in plain words | The confirmation before a cancel, withdraw, reschedule or move |
| `core.change-guard` | code | Given the same, allow or refuse with a reason, and optionally a link to the contributor's own screen where the matter is settled | Stopping a change another module cannot survive. Core never collects another module's decision itself. |
| `core.delete-guard` | code | Given a record, allow or refuse | Stopping deletion of a draft something else points at |
| `core.space-busy` | code | Given a space and a window, the times it is taken, each marked as yielding to a performance or not, with a statement predicate for those that do not yield | The Spaces module's bookings in the overlap check |
| `core.booking-action` | code | Given a performance, a label, a link and a state (`available`, `limited`, `sold-out`, `not-yet`, `closed`) | The booking button. Box office contributes. With none, the performance's external booking link is used. With neither, no button shows. |
| `core.notification-channel` | code | A channel id, a `send()` and a way to tell if an account can receive | Email and inbox ship with core. Push, and later others, plug in here. |
| `core.holiday-feed` | code | Given a year and a country, a list of dated names | Public holidays. Core ships a contributor for the United Kingdom's published bank-holiday feed. |
| `core.file-access` | code | Given a record and an account, whether they may read its files | Files with `record` access |
| `core.public-component` | data | A component name, its module, a short alias for content files, its properties and a one-line description | Components a content page may use. See below. |

With the four data points further down, that is thirteen points. An earlier draft had a fourteenth, `core.production-section`, for panels on the production page. It is deleted: the interface specification's `core.record-tab` is the one way any module adds to any record page, and core's production page reads it.

**What core contributes to other points.** Core contributes only to points owned by the foundations, identity and interface parts of core, and to no switchable module's point.

| Point | Core's contribution |
| --- | --- |
| `core.navigation` | The console's Programme, Places, Messages and Site groups |
| `core.setup-step` | The look, the first venue, the sender, and the email outcomes subscription once the sending domain is verified |
| `core.health-check` | Sending domain verified. Email outcomes subscription made. Mail sent for a day with no outcome received. "Drop suppressed recipients" left off. Stuck deliveries. Paused webhooks. Orphaned files. |
| `core.record-resolver` | Core's eight record types |
| `core.erasure-handler` | Files |
| `core.merge-handler` | Notification preferences: where both accounts have a row for the same topic and channel, the survivor's wins |
| `core.account-section` | Inbox and Notification preferences, one of each for each side. The content is core's and the frame is the interface's. |

### `core.public-component`

Workstream 6 asked that one workstream own the shape of public components, and proposed this one. Agreed. The rules:

- **Declared by a module.** Each entry names the module, so the build knows where it came from.
- **Two names.** The component's own name starts with its module's id, as every component's must: `PublicSiteWhatsOn`, `CoreCallout`. Each entry also declares a short alias, such as `whats-on`, and the alias is what a content file writes. Aliases are unique across modules, and the build refuses a clash or an alias that shadows an HTML element. This is the foundations ruling of 16 November 2026.
- **Gone cleanly when its module is off.** A page that uses a component whose module is switched off renders nothing in its place and logs a warning to the site-readiness screen. It never errors.
- **Unknown name fails the build.** A page using a component no module declares fails `bun run check`, the same way an unknown setting does.
- **A theatre's own components need no entry.** Anything in `site/app/components/content/` is the theatre's and is always available.
- **Bound by the interface specification's rules for every screen.**

## What a module declares to core

| Declaration | Fields |
| --- | --- |
| Vocabulary | Key, ordering, locked, term class, starting terms |
| File slot | Record type, slot name, one or many, accepted types, size-limit setting, default access, the class of its title and alt text, cleaning, whether alt text is required |
| Notification type | Key, topic, category (`transactional` or `optional`), side (`audience` or `members`), lane (`prompt` or `bulk`), allowed channels, default channels, variables with their types, whether it may join a digest, coalescing window, default sender, and optionally a resolver that supplies the content at send time |
| Notification topic | Key, side, a label shown on the preferences screen |

By the foundations thread's ruling, each of these is a data point that core owns and a module contributes entries to: `core.vocabulary`, `core.file-slot`, `core.notification-type` and `core.notification-topic`. The rule for everyone is that anything one module lets others declare is a point.

**Lane.** A notification type may declare its lane: `prompt`, which is the default, or `bulk`. The job `core.send-notification` queues each send on its type's lane, so a mailing to many people never delays a receipt or a sign-in email. This is a foundations ruling of 16 November 2026, raised by the communications specification.

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
| `core.credit.added` | Optional | Members | A credit is linked to the person's account (question 5) |
| `core.delivery.failed` | Transactional | Members | A transactional delivery fails for good. Sent to holders of `core.delivery.read`. |
| `core.webhook.paused` | Transactional | Members | The system pauses a failing webhook. Sent to holders of `core.webhook.manage`. |
| `core.digest` | Follows its contents | Both | A digest is due |
| `core.test` | Transactional | Members | Someone presses "send me a test" on a template |

Core deliberately sends nothing to audiences about cancelled, rescheduled or moved performances. Only Box office knows who holds a ticket, so those messages are Box office's types, sent with `notify`.

Every other module declares its own types the same way. The identity module's sign-in link, its warning that a role is about to expire and its erasure and export messages are its types. The foundations health screen's warnings to administrators are its types. Core supplies the pipeline and declares none of them.

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

**Address prefixes.** `/files` is reserved. `/whats-on` and `/shows` are core-owned prefixes, in the foundations ruling's words: no other module may take them, and a theatre may still replace those pages from `site/app/pages/`. The other public content routes (`/seasons`, `/venues`, `/news`) are ordinary pages a theatre may replace the same way.

## Jobs and tasks

| Name | Kind | Does |
| --- | --- | --- |
| `core.send-notification` | Job, on its type's lane | Sends one delivery |
| `core.send-webhook` | Job, bulk lane | Sends one webhook delivery, through the kit's fetch wrapper |
| `core.check-file` | Job | Checks and cleans one upload |
| `core.purge-file` | Job | Removes one file's stored bytes |
| `core.recompute-days` | Job | Recomputes operating days after a settings change |
| `core.create-run` | Job | Creates a long run of performances in chunks. See C-04. |
| `core.email-events` | Consumer of the queue `EMAIL_EVENTS` | Records what Cloudflare reports about each email |
| `core.sweep-deliveries` | Task, every 5 minutes | Re-queues stuck notification and webhook deliveries, releases stuck sends |
| `core.complete-performances` | Task, every 5 minutes | Marks ended performances complete |
| `core.send-digests` | Task, hourly | Sends digests due at this hour in the theatre's time zone |
| `core.sweep-files` | Task, daily at 03:00 | Rejects stale uploads, purges files past their date |
| `core.reconcile-files` | Task, weekly | Finds stored bytes with no row |
| `core.import-holidays` | Task, weekly | Refreshes public holidays from the feed |
| `core.archive-seasons` | Task, daily at 03:00 | Archives ended seasons, if the setting allows |

Weekly tasks use the form the foundations thread added on request: `task({ weeklyOn: { day: 'mon', at: '06:00' } })`.

## Content structure in the fork

The theatre owns `site/`. Upstream ships it once as a working starter and never changes a file under it again, so merges do not conflict.

| Path | Holds |
| --- | --- |
| `site/content/index.md` | The home page |
| `site/content/<name>.md` | Any page: about, visit, get involved, contact |
| `site/content/news/<date>-<slug>.md` | News posts |
| `site/content/policies/<name>.md` | Policies, which quote settings |
| `site/content/navigation.yml` | The public header and footer links (question 4) |
| `site/content/redirects.yml` | Old addresses and where they now go |
| `site/content.config.ts` | Content collections the theatre adds |
| `site/app/components/content/` | The theatre's own components for use in pages |
| `site/app/pages/` | Whole pages that replace a built-in public route |
| `site/public/` | Static files |

Upstream's collections are declared in the `content.config.ts` at the root of the repository, which also brings in the theatre's own from `site/content.config.ts`. The foundations proof showed that a collection a theatre declares there survives an upstream merge and is served from the database.

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

**Quoting a setting:** `:setting{name="box-office.orders.seat-cap"}`. The property is `name` because Vue reserves `key`, as the foundations as-built list records. Proscenium writes these as `{{KEY}}`, which Nuxt Content's markdown reads as a data binding, so the component form avoids a clash.

**Starter content** is shipped inside `site/`: a home page, a what's on page and sample pages. Later improvements to the starter go to a separate `examples/` folder upstream, for a theatre to copy if it wishes. Every starter page has `placeholder: true`. Proscenium's decision 0051 uses the same marker for the same reason.

**The content database.** Nuxt Content on Workers needs a D1 database. This specification assumes it shares the theatre's one database under the binding `DB`, with its tables left alone by the migration journal. That is a foundations matter and has been sent there.

## Public components core and the public site declare

| Alias in content | Component | Properties | Shows |
| --- | --- | --- | --- |
| `whats-on` | `PublicSiteWhatsOn` | `limit`, `category`, `season`, `venue`, `layout` | Upcoming published productions |
| `season-grid` | `PublicSiteSeasonGrid` | `season` (slug or `current`) | One season's productions |
| `production-card` | `PublicSiteProductionCard` | `slug` | One production |
| `performance-list` | `PublicSitePerformanceList` | `production` | Dates, times, access features and a booking action for each |
| `booking-button` | `PublicSiteBookingButton` | `production` or `performance` | The booking action, from `core.booking-action` |
| `credits` | `PublicSiteCredits` | `production`, `section` | The credits list |
| `advisories` | `PublicSiteAdvisories` | `production` | Content and technical warnings, behind a "show" control if the theatre chooses |
| `archive-search` | `PublicSiteArchiveSearch` | `from`, `to` | Search across past productions |
| `venue-info` | `PublicSiteVenueInfo` | `venue` | Address, map link, access features as icons with labels, access and travel text |
| `news-list` | `PublicSiteNewsList` | `limit` | Recent news posts |
| `setting` | `CoreSetting` | `name` | One quotable setting |
| `contact-details`, `social-links` | `CoreContactDetails`, `CoreSocialLinks` | none | From organisation settings |
| `callout`, `hero`, `gallery` | `CoreCallout`, `CoreHero`, `CoreGallery` | Their content | Layout pieces with no data |

The paper also lists a committee list among the ready-made components. That belongs to the later governance module, which will declare it through this point; core ships none.

## What this workstream needs from the others

All of these are now agreed.

| From | Need |
| --- | --- |
| Foundations | The data-format rulings in part 2. The data points for vocabularies, file slots, notification types and topics. The colour and time kinds for settings, the weekly task, the type real, encrypted columns, the listener on every deliverable event, and the queue `EMAIL_EVENTS`. The settings `core.site.name` and `core.locale.*`. Its own notification types for the health screen's warnings. |
| Identity | `core_accounts`. `addressFor(accountId, side)` for the address to write to on each side. `holdersOf(ability, record)`. `mergeAccounts`, which moves core's rows by column declaration and calls core's merge handler. Its own notification types for sign-in links, expiry warnings, erasure and export. It reads `core.organisation.year-end`. |
| Box office | Contributions to `core.booking-action`, `core.change-impact` and `core.change-guard`. Sale state is Box office's (question 1). Its own notification types for orders and for cancelled, rescheduled and moved performances, sent with `notify`. It listens to `core.performance.cancelled`, `rescheduled`, `moved`, `capacity-changed` and `scheduled` with `reinstated` set. |
| Form builder | Uses `core_terms` for reusable option lists and `core_files` for uploads, with its own slots and `core.file-access`. It declares its own form slots on core's record types and adds its custom-fields panel through `core.record-tab`; core declares no form slot and knows nothing of forms. |
| Interface | The shells read `getBrand()`. It owns `core.record-tab`, `core.account-section`, the colour mode settings and the frame of the account area. `/files` is a reserved prefix. |

## Agreed for the Communications module

Four requests from the communications specification, accepted on 16 November 2026 on the integrating thread's recommendation. They are built with the Communications release, not before. Only the two small table points at the end are made now, so nothing has to be migrated later.

| Request | What core provides |
| --- | --- |
| Content from the owning module | A notification type may declare a resolver. The payload then carries ids only, and core calls the resolver at send time for the subject and body. A mailing's text is therefore stored once, by its module, and never copied into `core_notifications`. A resolver that fails counts as a failed attempt and is retried. |
| One-click unsubscribe | Core adds the `List-Unsubscribe` and `List-Unsubscribe-Post` headers to every email whose type is not transactional. The target is core's own preference link by default, and a type may supply its own. |
| Reach and results | Services `emailReachability(accountIds, side)`, which says for each account whether an email would be sent and, if not, a reason code, and `deliveryCounts(subjectType, subjectId)`, which counts deliveries by state for one record. `notify` takes an optional `senderKey`. Two internal events, `core.delivery.bounced` and `core.delivery.complained`. |
| Audience sources | Core contributes nothing, because core never contributes to a switchable module's point and never names one. The Communications module declares "a production's team" itself, reading core's fact `core.production-team`, and "holders of a role" from the identity module's services. Ruled by the foundations and integrating threads on 16 November 2026. |

Table points made now: the delivery state list gains `complained`, and `core_notifications` gains an index on `(subject_type, subject_id)` for the counts.

## Agreed for the Spaces module

Two requests from the spaces specification, accepted on 16 November 2026 on the integrating thread's recommendation. Neither changes a table.

| Request | What core provides |
| --- | --- |
| Bookings that give way to a performance | A contribution to `core.space-busy` may mark its times as yielding. Scheduling, rescheduling or moving a performance over yielding times is not refused: the times appear as a warning through `core.change-impact`, and the person confirms. The contributing module then acts on `core.performance.scheduled`, `core.performance.rescheduled`, `core.performance.moved` and `core.closure.created`. Times not marked as yielding refuse, as before. |
| A check another module can put on its own write | `assertSpaceFree(spaceId, from, to)`, a statement predicate like `assertTerm`. It returns a condition, not an answer: the caller places it on its own conditional insert or update, inside its own batch. The condition is false when a scheduled performance in that space overlaps the times, or when a blocking closure of the space, its venue or the whole theatre does. |

Why the second one is sound. The rule for a contended claim is that the predicate sits on the statement, never in a read made beforehand. `assertSpaceFree` is only ever a fragment of the caller's statement, so it meets the rule, and the database runs one write at a time, so two claims cannot both see the space as free. It reads the existing indexes `(space_id, starts_at)` on performances and `(starts_at, ends_at)` on closures.

The same rule the other way round. When core schedules a performance, a module whose times do not yield must give core a predicate of its own with its `core.space-busy` contribution, which core places on the scheduling statement. A contribution with no predicate can only warn, so it must be marked as yielding. That keeps both directions on the statement and neither on a prior read.

## Bounces and complaints from Cloudflare Email Sending

This closes the point left open in the first draft: Cloudflare does report what happened to a message. Checked on 16 November 2026 against Cloudflare's documentation: [event subscriptions](https://developers.cloudflare.com/email-service/reference/event-subscriptions/), [suppression lists](https://developers.cloudflare.com/email-service/concepts/suppressions/) and [troubleshooting](https://developers.cloudflare.com/email-service/reference/troubleshooting/).

What Cloudflare provides:

- **Six events on a queue.** `message.delivered`, `message.deferred`, `message.bounced`, `message.failed`, `message.rejected` and `message.complained`, through a Queues event subscription scoped to one sending domain. Each carries the message id, the recipient, whether it is final, and the SMTP status. A bounce says whether it is hard or soft.
- **Its own suppression list, which core does not rely on.** Cloudflare's documentation says it suppresses hard bounces and complaints for the sending domain, and that a send to a suppressed address fails: the Workers binding throws `E_RECIPIENT_SUPPRESSED`, and a `message.rejected` event follows with the reason `suppressed`. An API lists the entries and accepts ours. The proof below found that this does not happen promptly, so core treats it as a backstop that may or may not be there.

What core does with it:

| Event | Effect on the delivery, found by `provider_ref` |
| --- | --- |
| `message.delivered` | Stays `sent`. Nothing else is recorded. |
| `message.deferred` | Nothing. Cloudflare is still trying. |
| `message.bounced`, hard | State `bounced`. The address is added to `core_email_suppressions` with reason `hard_bounce`. `core.delivery.bounced` is announced. |
| `message.bounced`, soft | State `bounced`. No suppression in core, because a soft bounce may clear. |
| `message.complained` | State `complained`. Suppression with reason `complaint`. `core.delivery.complained` is announced. |
| `message.failed` | State `failed`, shown on the health screen. |
| `message.rejected`, or the binding refusing a suppressed address | State `suppressed`, reason `suppressed_address`. The address is added to core's list if it is missing, so the two agree. |

Rules that follow:

- **Core's own list is what stops a repeat send.** Core checks `core_email_suppressions` before every send, of every type, and skips an address on it. The entry is written when `core.delivery.bounced` (hard) or `core.delivery.complained` is recorded, in the same unit. Cloudflare's list is not relied on: if the binding does throw `E_RECIPIENT_SUPPRESSED`, the delivery becomes `suppressed` and the address joins core's list, but nothing waits for it. A manual suppression in core is pushed to Cloudflare, and lifting one in core lifts it there, where Cloudflare allows it.
- **The consumer is safe to repeat.** Each event has its own id. A delivery already in a final state is not changed by a repeat or a late event.
- **Nothing personal is logged.** The event holds the recipient's address and the subject line. The consumer reads the message id and the outcome, hashes the address where it needs to suppress, and writes neither the address nor the subject to any log.
- **One more resource to deploy.** Each theatre needs a queue for these events and a subscription from its sending domain to it. By the foundations thread's ruling, the queue is a binding named EMAIL\_EVENTS, created on first deploy like the others. The subscription cannot be: the domain must be verified first and the application holds no account token. So it is a core setup step, shown once the sending domain is verified, that gives the dashboard clicks and the four events to choose (bounced, complained, failed, rejected). A core health check warns while the step is not done, warns when mail has gone out for a day with no outcome received, and reminds the administrator to leave "Drop suppressed recipients" off. A message in a shape the consumer does not recognise is acknowledged and logged, not retried, because the shape is Cloudflare's to change. The task `core.email-events` is the queue's consumer.
- **Limits.** One email takes at most 50 recipients. Core sends one email for each recipient, so it never meets this. Cloudflare describes the product as transactional; whether mailings fit is the Communications module's question, which that thread is checking.

### What a run on a real sending domain showed

The build ran the bounce half on a real sending domain on 16 November 2026 (report at `/mnt/project-files/core-domain-proofs/report.md`, proof 2). Four findings are now rules:

| Finding | Rule |
| --- | --- |
| The bounced event's `payload.messageId` is the identical string `send()` returns, angle brackets included. | `provider_ref` stores the value exactly as returned, with no trimming, and is matched exactly. |
| The event reached the queue about 0.6 seconds after `send()` returned: a hard bounce, classed `permanent_failure`, with the SMTP reply. Its payload also carries the recipient and the subject. | The consumer reads the message id, the outcome and its class. It logs neither the recipient nor the subject, and never the whole payload. An outcome can arrive before the send job has finished recording Sent, so the consumer retries a message whose `provider_ref` it cannot yet find, a few times, before setting it aside. |
| After a hard bounce, `send()` to the same address did not throw. Two resends succeeded and bounced again, and Cloudflare's suppression list was still empty four and a half minutes later. | Core's own suppression is what stops repeats, checked before every send. `E_RECIPIENT_SUPPRESSED` is handled if it comes and never relied on. |
| For about two minutes after the sending domain was onboarded, `send()` threw `E_EMAIL_SENDING_NOT_READY`, even with the DNS status ready, and once more after the first success. | The sender setup step and its verify treat that code as "try again shortly" and keep checking, not as a failed domain. A send job that meets it retries on the usual back-off and does not count it towards a Failed delivery's limit during the first hour after onboarding. |

The complaint half is not yet proved. Cloudflare offers no way to simulate a complaint, so it needs a real mailbox at a provider that reports them. Until it is run, that a complained event carries the same message id is taken from the documentation and from the bounce result.

## Access needs and access features are two lists

The identity specification declares a vocabulary, `core.access-need`, for what a person needs (standing, level access, an essential companion and so on). It uses the vocabulary format in this part unchanged: terms with ids, translatable labels, and a record that stores the id. It is separate from the access features of a venue, a space or a performance (captioned, signed, relaxed and so on), which describe what the theatre offers and stay this workstream's. Neither list refers to the other. Matching a person's needs to what a performance offers is for the module that sells or staffs it.

Core domain declares no purpose through `core.access-purpose`. Production teams do not read access needs in the first release, by Matt's choice, and the welfare lead is the route.

## The access scheme's public page

The identity specification defines an access scheme a person applies to. Its public page is theatre content with one component in it, like every other page on the public site.

| Thing | What is specified |
| --- | --- |
| The page | `/access`, from `site/content/access.md` in the starter content. It is a seeded page: it ships with plain wording that reads correctly unedited (what the scheme is for, how to apply, how long a reply takes), and carries `placeholder: true` so the site-readiness screen lists it until the theatre has made it its own. |
| The component | `CoreAccessApplication`, alias `access-application`, so the page writes `::access-application`. Identity contributes it through `core.public-component`. It shows the way into the application for the person viewing it. Identity owns everything it shows and does. |
| The reply time | The page quotes it live with `:setting{name="core.access-scheme.reply-within"}`, so the wording cannot drift from the setting. |
| If the theatre has not edited it | The seeded wording and the component show. Nothing is hidden and nothing is broken; the page is only listed as unfinished. |
| If the theatre deletes it | `/access` answers "not found". The content check warns, because other modules link to this address. |
| If the public site is off | `/access` answers "not found" with the rest of the public site. Applying from My account is identity's and does not depend on this page. |
| The address | `/access` is a content address, not a reserved prefix, so a theatre may also redirect it to a page of another name through `redirects.yml`. |

Identity has confirmed the component's name and behaviour. It shows "Apply" to a person who is signed out or has not applied, and the state of their own application to one who has. While `core.access-scheme.enabled` is off it shows nothing, so the seeded wording is written to read sensibly without it, and the site-readiness screen says the page has nothing to offer. The page names the scheme with `:setting{name="core.access-scheme.name"}`, so it uses the theatre's own name for it. The form itself lives under `/account`.

Identity's nineteen notification types, the five for the access scheme among them, are declared through `core.notification-type` in the format this part gives: each has one side, a kind, a lane and its channels. They need nothing the format lacks. The nineteenth, `core.grants-expiring`, was added on 16 November 2026: members' side, transactional, sent once per sweep to those who can renew. Its key clashes with none of core's own types, and a transactional type on the members' side is one the format already allows.

## Fan-out: many rows in one unit of work

The kit refuses a unit of work with more statements than `core.units.statement-limit`, which defaults to 50. The integrating thread has ruled that the limit stands. So nothing in core writes one statement per row when it tells many people or makes many records at once.

The rules are the kit's, in the foundations specification's part 3 (U7 to U9), and core follows them:

| Rule | Detail |
| --- | --- |
| Write set-wise (U7) | Every row of the set travels in one JSON parameter, and each table is written by one `INSERT ... SELECT` that reads it with `json_each`, through the kit's helper. Ids are made by the kit before the unit is built and travel in the JSON. A unit costs the same few statements however many rows it carries, and no statement comes near D1's limit of 100 bound parameters. |
| Events and audit entries take a set (U8) | `unit.announce()` and `unit.audit()` each take one row or a set, and a set of any size is one statement. The caller passes the set it read before building the unit. The guards on the change make that set true or roll everything back. Each event is still delivered as its own event, at least once and unordered. |
| The most one unit may carry (U9) | The kit setting `core.units.set-rows-limit`, 500 as shipped and provisional until measured on real D1. Over it the unit is refused with `core.unit.too-large`, and the work becomes a job in chunks, each its own unit and safe to repeat. Core states no figure of its own. |
| `notify()` | Four statements for any number of recipients up to that limit: notifications, email deliveries, inbox deliveries and inbox items, plus the caller's audit entry. A repeat with the same dedupe keys writes nothing at all. It never chunks silently, because a chunked send is no longer all or nothing and the caller must know that. |
| Still one unit | The statements join the caller's unit, so a unit whose expectation fails leaves no notification behind, as before. |
| After the unit commits | Email deliveries are put on the queue in calls of 100, the most one `sendBatch` takes. The sweep in part 3 covers any that are lost. |

What has been measured: the build's proof ran fifty recipients on local D1 (five statements and 4 ms set-wise, against 201 statements and 10 ms row by row). Nothing larger has been run, and nothing on real D1.

Core's fan-outs under these rules:

| Fan-out | How it is written |
| --- | --- |
| A run of performances (C-04) | The performances travel as one JSON parameter. A run within the limit is saved whole or not at all: the clash and closure guards are predicates on the insert, with an expectation that the number inserted is the number asked for, and one announce of the set. A longer run is a chunked job, as C-04 says. |
| Cancelling a production | The scheduled performances are read first. Then one conditional `UPDATE` with an expectation of that number, one announce of that many events and one audit set. If a performance changed in between, the expectation fails and nothing is written. |
| `notifyHolders` and a notification to a production team | The recipients are resolved first, then passed to `notify()` as one set. |
| Webhook deliveries | One set-wise insert for the webhooks subscribed to the event. |
| Recalculating operating days | One `UPDATE` over every performance not completed. |

Sources: the proof report at `/mnt/project-files/core-domain-proofs/report.md`; D1's limits (developers.cloudflare.com/d1/platform/limits) for 100 bound parameters, 2 MB for one value and a batch counting as one query; Queues' limits (developers.cloudflare.com/queues/platform/limits) for 100 messages or 256 KB in one `sendBatch`. Both read on 16 November 2026.

## Setting up the sending domain automatically

Matt asked, through the build thread on 16 November 2026, for the sending domain to be set up the way Mailflare adds one, without the administrator touching DNS. This is story C-52. It is an addition: with no token, everything above stays as it is, and an administrator types the domain and verifies it.

| Part | What is specified |
| --- | --- |
| The secret | An optional Worker secret, `CORE_CLOUDFLARE_TOKEN`, holding a Cloudflare API token limited to Email Sending edit and Zone read on the theatre's own zone. The foundations specification's secrets table is the index of every core secret, and lists it as optional. |
| The button | With the token present, the Sending screen and the "Your sender" setup step show "Set up automatically" to a holder of `core.sender.manage`. Pressing it asks for a fresh passkey check and is audited, because it changes DNS. |
| Finding the zone | Core finds the zone from the site's own hostname, by the longest matching suffix among the zones the token can read. |
| Creating the domain | Core asks Cloudflare to create the sending subdomain `<label>.<site host>`, and Cloudflare writes the DNS records. The call is one of the kit's declared external calls, so it is audited and can be retried. If the subdomain already exists on that zone, core adopts it and creates nothing. |
| Afterwards | Core sets `core.notifications.sending-domain`, waits out `E_EMAIL_SENDING_NOT_READY` as the section above describes, and runs the existing verify. It never replaces a sending domain that is already set without the administrator confirming the change, showing the old and new names. |
| No zone | On a `workers.dev` address there is no zone. The button is replaced by a sentence saying a custom domain is needed first, with the manual route still offered. |
| The label | A new text setting, `core.notifications.sending-label`, changed by `core.sender.manage`. It sits under the site's hostname, not the zone's apex, so it cannot clash with mail the theatre already runs, and it leaves the Communications module its own subdomain for mailings. Its default is `mail`, which Matt chose over `notifications` and `notify`. |
| The token is never seen | It is never shown, logged, returned by any route or stored outside the secret. The health check reports only whether it is present and whether it can read the zone. |
| What it does not do | It does not create the email outcomes subscription. That needs wider permission than this token has, so the setup step for it stays as written. Widening the token to do it is a possible later change, not part of this story. |

Matt chose `mail` as the label's default on 16 November 2026, so the setting ships as `mail` and holds one DNS label. Two details the build added, both accepted: a site hostname that starts `www.` drops the `www.` before the label is put in front, and the verify job tries once a minute for up to ten minutes before leaving the matter to the health check.

The names the build registers for this story:

| Kind | Name |
| --- | --- |
| Setting | `core.notifications.sending-label` |
| External call | `core.create-sending-domain` |
| Job | `core.verify-sending-domain` |
| Health check | `core.cloudflare-token` |
| Setup step | `core.sender`, at `/console/system/email` |

Not checked by this specification: the exact Cloudflare API call for creating a sending subdomain. The pull request that builds this story records it.

## Later slice: guidance for a production (content warnings, effects and age)

Part 2 gives the data and rules of this slice, which Matt accepted on 16 November 2026. This section gives what other modules and the public site see. None of it changes what is built today.

| Item | What is specified |
| --- | --- |
| One read | `guidanceFor(productionId, performanceId?)` returns the age (`ageMin`, `ageRestricted`), the staging effects with their details, the content warnings with level and detail in their derived order, the content note, and whether each of the two questions has been answered. With a performance id, effects switched off for that performance are left out and listed separately as `notAtThisPerformance`. Core does not know who calls it. |
| The vocabulary format | A contribution to `core.vocabulary` may say `grouped: true`. The vocabulary services return each term's heading, and `listTermGroups(vocabulary)` returns the headings in order. |
| Public component | `advisories` keeps its name and gains a `compact` form for cards and a basket: the age badge and an icon when there are staging effects. The full form is the layered display in part 5's terms: age and effects always visible, one line counting the content warnings, one press to list them by level, a second press on any one for its detail and the content note. A production with nothing to declare says so in words. |
| Event | `core.production.updated` already announces a change to advisories. Its payload gains `guidanceAdded`: the term ids of effects added and of content warnings added with their levels. It names terms, never people, so it may leave in a webhook. A module that holds bookings decides from it whether bookers are told; the rule proposed is an added effect or an added `depicted` warning. |
| For message templates | A block, `before-you-come`, built from the same read: age, effects and a link to the production page. It never contains a content warning's label, because an inbox is not private. Core offers the rendering as a component and contributes it to no module's point; a module that wants it in its own messages declares its own block and uses the component or the read. |

Agreed with the Communications module on 16 November 2026 (its later story COM-39). `guidanceFor` returns public data only, but it includes content warnings, so it is not rendered whole into an email. A second read, `beforeYouCome(productionId, performanceId?)`, returns only what is safe in an inbox, and a module renders all of it without choosing fields:

| Field | Holds |
| --- | --- |
| `ageMin`, `ageRestricted` | The age, or null |
| `effects` | Each staging effect's term id, label in the reader's language, and detail, after any performance exceptions |
| `notAtThisPerformance` | Labels of effects switched off for this performance |
| `hasContentWarnings` | True or false, never a count or a name, so a message can say "content warnings are on the show's page" |
| `pageUrl` | The production's public address, current or archive form, absolute |
| `empty` | True when there is no age, no effect and no content warning, so the caller renders nothing |

Core offers a rendering of this read in the brand as a component, for its own notification templates and for any module to reuse. Core contributes it to no module's point (integration ruling R-06): the Communications module declares its own block on `communications.block` and renders it from this read. Either way it is a service message, not promotion, so a reminder to ticket holders may carry it, as may a mailing.

What each bordering module does with the read is its own specification's: Box office states age and effects in the basket and asks for an age restriction to be acknowledged, Front of house puts effects with their timing notes and the age restriction on its briefing, and Communications places the block. Each of those is a later story in that module, following this slice.

The audience's own "tell me about" list (story C-58) is kept in the browser only. Core stores nothing about what a named person wants to be warned of, and no service returns it.
