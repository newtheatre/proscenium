# The kit

Every module is built with the kit in `layers/core/kit`, imported as `#kit`. It turns a module's
declarations into a running system and enforces the Foundations specification's rules, so a module
cannot forget a permission check, half-write a change, or run a job twice.

## A module

A module is a folder in `layers/` (upstream) or `site/layers/x-<name>/` (a theatre's own) holding:

```
module.ts                     The manifest: defineModule({ id, manifest: 1, since, ... })
server/db/schema.ts           Tables, with defineTable and col.*
server/api/<id>/...           Routes, each written with defineRoute
server/listeners/<name>.ts    One per entry in events.listens
server/jobs/<name>.ts         One per job (the part of the name after the module)
server/tasks/<name>.ts        One per task
server/calls/<name>.ts        One per external call: defineCall({ outcome, reconcile })
server/services.ts            What other modules may import as #modules/<id>
i18n/en-GB.json               Labels and help for everything declared
```

`bun install` (or `bun run generate`) reads every manifest and writes `.generated/`: the registry,
the bundled migrations and the types that make `useSetting('x')`, `enqueue('x')` and a route's
`ability` type errors for undeclared names. A manifest mistake fails with the file and the field.

## Tables

```ts
export const items = defineTable('lost_property_items', {
  id: col.id(),
  description: col.freeText(text('description')),
  finder: col.account('finder_id', { role: 'subject' }),
  foundAt: col.timestamp('found_at').notNull(),
}, { id: 'lpi', realm: 'operational' })
```

Every column has a data class (`public`, `internal`, `personal`, `freeText`, `special`); a column
without one fails the build. Ids are `<prefix>_<26 characters>`, sorted by creation time unless
`random: true`. `appendOnly: true` adds database triggers that refuse updates and deletes, except
erasure writing its placeholder. A realm is `audience`, `members`, `operational` or `system` (the
platform's own tables). An account subject column that may be empty needs
`subject: { account: 'account_id', unlinked: 'staff' }`: staff reach the rows it cannot link by
search. `col.internal()` and `col.personal()` take `encrypted: true`, sealed with the one core key as
`col.special()` always is.

A table whose rows must not be dateable, such as a secret ballot, says `timestamps: false`: it may
hold no `createdAt`, `updatedAt`, `timestamp` or `localDate` column, needs `random: true` (a
time-sorted id dates its row) and has no retention. `withoutRowid: true` makes it `WITHOUT ROWID`,
so SQLite stores rows in primary key order rather than the order they were written; the table
needs a primary key and cannot be searched. Drizzle Kit cannot write the clause, so
`db:generate` adds it, and the conformance check fails a migration that makes the table without
it (R3-23). After changing a table run `bun run db:generate -- --name <what>`;
the conformance check fails while the code and the migrations disagree.

Until the first release the migrations were squashed into one baseline per journal on 19 November
2026 (`migrations/…_baseline`, `tests/fixtures/migrations/…_baseline`). Drizzle Kit wrote the
tables; the life-cycle and counter triggers it cannot write, and the `none` tax code, follow at the
end of the upstream baseline, carried over by hand. The unused `core_productions.age_guidance`
column was dropped. A database made from the old migrations does not upgrade to the baseline: it
is reset (every table dropped, or a new D1 database bound) and migrated afresh. Once a release is
tagged, migrations are never squashed again.

### Accounts, the account scope and merges

`col.account(name, { role, onMerge })` refers to an account. `onMerge` is `alias` when left out: the
column keeps the id it was written with and reads follow the merge. `move` (the stored id must be
the survivor's: a unique rule, or the person's own living record) needs a one-line `reason`;
`handler` leaves the column to the module's merge handler. Actor columns, and every account
column in an append-only table, are alias.

Because a merge leaves most columns alone and moves the rest in stages, every read by account,
and every count or claim condition, goes through the account scope, all from `#kit`:

- `inAccountScope(column, account)`: the condition `column IN (the scope)`, for reads, updates,
  counts, claim conditions and inside a set-wise `INSERT ... SELECT`.
- `accountScope(account)`: the subquery itself, the survivor and every account merged into it.
  `account` is an id (a survivor's or a merged-away one) or an SQL expression, such as a
  `json_each` value, so a set works it out row by row; the survivor is resolved inside the
  statement, so a unit needs no read first.
- `accountScopeIds(accountId)`: the ids, survivor first, for display, logs and tests only.
- `exactAccount(column, accountId)`: `column = accountId`, the one escape, for identity's own
  tables and the merge job; anywhere else the line ends `// exact-account: <why>`.
- `canonicalAccount(id)` (core's services) resolves a stored id to its survivor.

`bun run check:conformance` refuses `eq`, `inArray` or raw SQL that compares an account column to a
value outside identity's code. Erasure matches the person's rows through the scope.

A module with `onMerge: 'handler'` columns supplies a `MergeHandler`: `merge(unit, { mergeId,
survivorId, mergedAccountId })` fits one unit, is safe to run twice, may answer `NOT_YET`, and lists
every row it changes with `recordMergeItems(unit, { mergeId, table, column, mergedAccountId, action })`
before changing it. `action` is `moved`, `ended` or `set-aside`; a set-aside row also says what the
close of the undo window does with it, `onClose: 'delete'` (the default) or `'keep'`. An optional
`undo` puts things back itself and answers `{ notRestored, reason }`. `moveAccountColumn` is the
merge job's two statements for one move column: list the rows, then re-point them. Identity owns
the merge job (`core.merge-move`) and its order: within a module, handlers before moves; on undo,
the reverse.

## Routes

```ts
export default defineRoute({
  ability: 'lost-property.items.record',   // or public: true, or 'signed-in'
  rateLimit: 'write',
  idempotent: true,                        // needs an Idempotency-Key header; repeats replay
  input: z.object({ description: z.string().max(500) }),
}, async (event, { input, actor, unit }) => {
  unit.add(insertStatement).expect(1)
  unit.announce('lost-property.item.recorded', { itemId })
  return { itemId }
})
```

Before the handler runs the kit checks, in order: the module is on (else 404), the rate limit
(429), Turnstile if `protect: 'turnstile'`, the ability (401 or 403), and then the input (422
naming the fields), so a caller without the ability learns nothing about the input. Every refusal has the body `{ code, reason, remedy?, fields?, detail? }`. `detail` holds facts a screen may link to or act on (the id of the record in the way), never prose. The kit commits the unit
of work after the handler returns, with an audit entry when the ability is audited.

A route that takes a file's bytes declares `body: 'binary'`: the kit leaves the body unread for the
handler (`readRawBody(event, false)`) and validates the query against `input` instead. Such a route
cannot be idempotent.

### The site's address

Build an absolute address with `await siteUrl('/tickets/abc')` (or `siteOrigin()`), never from a request
header. It answers from the Worker variable `CORE_SITE_ORIGIN` when set, else the setting
`core.site.origin`, which first-run setup records from the address it ran on. Until either is set, a
route answers from its own request; outside a request it refuses with `core.site.origin-unset`, and a
job that meets that refusal is put back unrun, without spending an attempt. Once an origin is
recorded, a read on any other host is redirected to it (307) and a change there is refused, except the
health probe, a provider's webhook (`/api/<module>/webhooks/...`) and first-run setup. The Health
screen shows whether the address is recorded and when the variable is in force.

### Link tokens

A link that opens one thing without signing in (a ticket, a booking) carries a token made by
`linkTokens.issue()`, which answers `{ token, hash }`. Store the hash and an expiry on the row the link
opens; pass the token once, straight to the notification that sends the link, as a sealed variable.
Look a presented token up by `linkTokens.hash(presented)`. A token is never stored, sealed, logged, or
put in an event, a job's payload or an audit row. A route that takes one in its path declares it,
`tokens: ['token']` for `[token].get.ts`: the kit then writes `[token]` in its place in the log, error
reports and the idempotency record, and refuses an audit row, event or job payload that holds it. The
check refuses `sealSpecial` in a module with no special or encrypted column, and a call that seals a
token. A column declared `encrypted: true` that is not special (a ticket's code kept to show again) is
written with `sealColumn` and read with `openColumn`, the same pair under its own name; the check treats
it as it treats `sealSpecial`.

## Core's services

Any module may import core's services without listing core: `import { notifyAddress } from
'#modules/core'`. In roadmap phase 1 they are:

- `notifyAddress(unit, typeKey, { address, variables, locale?, dedupeKey? })` sends one
  transactional email from inside your job. Declare the type as a contribution to
  `core.notification-type` (wording inline, variables `url` or `text`, `{{ theatre }}` filled by
  core; a phrase your server code builds into a variable comes from your catalogue through
  `wordsFrom(catalogue)` from `#kit`, never an English literal). It throws on failure, so your job
  retries; nothing is sent until the sending domain is set and verified. In tests, `setMailer(fn)` from `layers/core/server/notifications/mailer.ts`
  records messages instead of sending them.
- `notify(unit, typeKey, { to, variables?, dedupeKey?, senderKey?, subject? })` tells accounts
  something (C-29). `to` is an account id or a set of them, each optionally
  `{ accountId, variables?, dedupeKey? }`. It adds the notifications, their deliveries and inbox
  items to your unit set-wise (a handful of statements up to `core.units.set-rows-limit`), so they
  exist only if your change is saved. Email goes out after the commit from the job
  `core.send-notifications`, at the address `addressesFor` gives for the type's side, and is
  retried with back-off; the inbox item is written at once. A repeat with the same dedupe key for
  the same type and account writes nothing and returns the earlier id. A channel the person
  switched off for an optional type's topic is recorded as suppressed; no address, an address on
  the suppression list or the type's module being off as skipped. Declare `channels: ['email',
  'inbox']` and, for the inbox, `link: '/path/{{ variable }}'`. The variables are cleared once no
  delivery needs them. A variable of kind `sealed` (a link that signs someone in, say) is kept
  encrypted in its own column, never in the payload, and cleared in the same unit that moves the
  email to a final state, or after seven days at most. A type with a sealed variable is email only;
  declaring one with another channel is refused at start-up. A cleared notification is not re-sent.
  Cloudflare's later reports arrive on the EMAIL_EVENTS queue and are matched by the message id
  `send()` returned: a hard bounce or a complaint marks the delivery Bounced or Complained,
  announces `core.delivery.bounced` or `.complained`, and puts the address on core's suppression
  list, which is what stops the next send (Cloudflare does not, soon enough). The task
  `core.sweep-notifications` frees deliveries stuck in Sending, re-queues lost ones, clears a
  notification's payload once every delivery is finished and any sealed variables left after seven
  days.
- `operatingDayOf(instant)` and `dayBounds(day)`: the theatre's operating day, which rolls over at
  `core.locale.day-start`. A table that stores one contributes to `core.operating-day`, so
  it is recalculated when the time zone or the rollover changes.
- `attachFile(unit, fileId, { slot, ownerType, ownerId })` and `detachFile(unit, fileId)`. Declare
  where your records hold files as contributions to `core.file-slot`; uploads go to
  `POST /api/core/files?slot=<id>&owner=<record id>` and are checked and cleaned by a job.
- `storeFile(unit, { slot, ownerType, ownerId, bytes, mediaType, title?, expiresAt? })` for a file
  your module makes itself, such as a download: it is ready and attached in your unit, with no
  upload check. Its slot says `source: 'server'` (and only such a slot may accept `json`, `zip` or
  `csv`); nobody can upload into it. With `expiresAt` the files sweep removes it, bytes and row,
  once that passes, and it is not served after. A slot with `access: 'record'` is served only to
  someone your `core.file-access` contribution allows: key it by the owning record type and export
  `{ canRead(actor, record, file) }` (type `FileAccess` from `#modules/core`).
- `isSpaceFree(spaceId, from, to, { except? })`: no scheduled performance or blocking closure, and
  nothing another module reports to `core.space-busy`, overlaps the window; `except` leaves out one
  module's own times. A read for showing and for a module's check just before its own write; a core
  write uses the predicate `assertSpaceFree`. A module that takes a space (a room booking, a
  training session, a pencil) contributes to `core.space-busy` a file whose `busy({ spaceIds, from,
  to }, actor)` answers `{ spaceId, kind, from, to, yields, record, label }` items, the label null
  where the reader may not see it (contract in `layers/core/server/points/space-busy.ts`).
- `getBrand()`: the theatre's name, logos and colour tokens for light and dark.
- Vocabularies, the shared lists of options such as production categories and advisories. Declare
  yours, with its starting terms, as a contribution to `core.vocabulary` (`id` is
  `<module>.<name>`); it is made the first time the module is on and from then on its terms are the
  theatre's. A record stores the term's id in a `col.ref('core_terms')` column, never the label.
  `listTerms(key, { includeRetired?, group? })` gives a picker's options in order; `group` narrows
  to the terms under one declared heading by its slug (made from the declared label, and kept when
  the theatre renames the heading), which is how `core.department`'s kinds, `production` and
  `organisation`, are read (R3-07); `getTerm(id)` gives a
  label for any term, retired or merged ones too; `assertTerm(id, key)` is the predicate to put on
  your own insert or update, then `.expect(1)`, so a retired term or one from another vocabulary
  is refused. Staff edit a module's terms on the Lists tab of its page in Admin
  (`/admin/modules/<module>/lists`, generated for any module that ships a vocabulary) and the
  theatre's own lists at `/admin/vocabularies`; a term in use can be retired but
  never deleted, and the restrict reference makes the database refuse it too. Merging terms
  (C-22) comes later; `core.term.merged` is declared for it.

## The unit of work

A change, its audit entry, its events and the jobs it queues commit together as one D1 batch, or
not at all. `unit.add(statement).expect(n)` guards a contended row: if the statement does not change
exactly `n` rows the whole batch rolls back and the caller gets a 409 refusal (the guard is an
insert into `core_guard` that a trigger aborts). A service receives the unit without `commit`.
`unit.afterCommit(fn)` runs after a successful commit; its failure never undoes the commit.

A unit holds at most `core.units.statement-limit` statements (50). A fan-out (one row for each of
many people, performances or seats) is written set-wise, never one statement per row:

```ts
const ids = unit.insertSet(deliveries, recipients.map(r => ({ notificationId: r.id, channel: 'email', state: 'queued' })))
unit.expect(recipients.length)
unit.announce('lost-property.item.recorded', items.map(itemId => ({ payload: { itemId }, record: ['lost-property.item', itemId] })))
unit.audit(items.map(itemId => ({ action: 'create', record: ['lost-property.item', itemId] })))
```

`insertSet(table, rows)` writes every row with one `INSERT ... SELECT` over `json_each`, carrying
the rows in a single JSON parameter, and returns the ids it made in order. Ids and other
`$defaultFn` defaults (such as `col.createdAt()`) are made before the unit is built, because the
unit does not read. Every row gives the same columns; a column no row gives takes its SQL default.
Binary values cannot travel in a set. `announce` and `audit` take one item or a set; a set is one
statement, plus one statement per listener for the listener jobs, and each event in it is
delivered as its own event. A set holds at most `core.units.set-rows-limit` rows (500 by default;
the setting refuses more than 2,000) and its JSON parameter at most 1 MB, a fixed kit constant,
because row width varies by table and D1 refuses a string over 2 MB. Either limit refuses the unit
with `core.unit.too-large` before anything is written; larger work is a job in chunks. Job messages go to the queues a
hundred at a time.

## Events, jobs and tasks

`unit.announce(name, payload)` writes the event and, in the same batch, a job for each listener in
a module that is switched on. Payloads hold ids, numbers, enums and `code()` values only, never a
person's words. Jobs run from two queues (`prompt` and `bulk`); the job row is the truth, so a
duplicate message runs once and a lost one is sent again by the sweep. A failed job is retried
with back-off (`core.jobs.backoff`) and is dead after its attempts, announcing `core.job.died`.
A job that cannot go on yet calls `job.defer(code)`: what it did commits, the attempt is given
back, and it runs again after a pause that doubles with each deferral (`job.deferrals`); a
deferral never makes a job dead.
Core alone may declare `events.listens: { deliverable: '<listener>' }`, the listener on
`'deliverable'`: it hears every event not marked `internal: true`, for the webhook sender. Stored states are queued, running, done, dead and cancelled; `cancelJob` (route
`POST /api/core/jobs/<id>/cancel`, ability `core.job.manage`) cancels a job that has not started. A
switched-off module's jobs wait. Tasks are declared with `every`, `dailyAt` or `weeklyOn` in the
theatre's time zone (UTC until setup sets it); the cron trigger runs only the latest due slot, once.

## Modules, records, facts and pages

A **support module** (`support: true`, C-65) is a shared part with no switch of its own, such as
`occupancy`: it is on exactly while a module that is on requires it, directly or through another
support module, and off otherwise (`resolveOn` in `#kit/modules-store`). Switching it is refused
(`core.module.support`), a row stored for it is ignored, and it cannot also be `switchable: false`
or `onAtSetup`. Its requirers list it under `requires` as usual, so they import its services
without exception; switching a requirer on does not ask about it, and when the switch brings it on
or off, `core.module.enabled` or `.disabled` is announced for it too. Its migrations run like any
module's. Admin > Modules lists it under "Comes on with other modules", with its state and the
modules that need it, and no switch.

`uses` may name a module that is not written yet if the design has reserved its id
(`RESERVED_MODULE_IDS` in the registry); listening to it or contributing to its points then does
nothing. A record type may have no table and a fixed list of ids (`record({ ids: ['site'] })`). A
fact resolver may give the accounts that hold it, `defineFact(resolve, { holders })`, read with
`factHolders(name, record?)`; without it the fact cannot be enumerated. A `core.navigation` entry
names a `menu` (account, members, console or live) and may set `hideEmpty` beside `count`; only an
account entry may use the ability `'signed-in'`. A theatre's page may not sit under a reserved
address prefix (`RESERVED_PREFIXES` in `scripts/checks/routes.ts`) or start with an underscore.

An ability's `implies` names the module's own abilities by short name (`order.view`) and another
module's by full id (`core.account.find`). Another module's ability may come with one only when it
declares `impliable: true`, is of risk normal, and is owned by core or by a module the implying
module lists under `requires`; one it only `uses` is not enough. The registry refuses anything else
when it reads the manifests. An impliable ability may be neither privileged nor on a record type,
because it comes with its implier at every reach: whoever holds the implying ability through a
site-wide, module or record grant, or through a fact, holds the impliable one too, with no record,
and the audit names the implying grant or fact.

## Requirements

A module that can judge a condition contributes a source to `core.requirement` under its own id,
in `server/contributions/core.requirement/<id>.ts`:
`export default defineRequirementSource({ options, describe, check, holder?, holderAbility?, checkAbility? })`.
A host stores references as text, `<source>:<id>`, or `fact:<name>` for a fact, which core
answers. It asks with
`requirements.check({ accounts, refs, at?, record?, presented?, whenUnavailable })`, and every pair
of account and reference gets `{ verdict: 'met' | 'not-met', unavailable, until?, reason?, summary?,
evidence?, help?, quantity? }`. `whenUnavailable` is required: `'met'` where the requirement
restricts who may do something, `'not-met'` where it grants a benefit. A source that is off, absent
or fails answers unavailable. `quantity` (a whole number, nought or more) is kept only on a met
verdict. With `checkAbility`, a check about any account but the actor's own reaches the source only
if the actor holds that ability, and the read is audited against the account; a job or task never
holds it. A check carrying a typed value counts against the `presented-value` rate-limit class, by
session and by address; past it, those pairs answer not met and the source is not called.
`requirements.holder(ref, evidence)` gives staff with the source's `holderAbility` a display name,
and audits the read. A met answer may also carry `holderAccountId`, the account a source knows a
presented value belongs to (R-34). It is for the host's server code only: the property is not
enumerable, so an answer turned into JSON (a route returning it, a summary, an event or job
payload) leaves it out, and it is dropped from any verdict that is not met.

## Email outcomes

Cloudflare Email Sending reports each message's outcome (delivered, bounced, complained and so on)
to a second queue, `EMAIL_EVENTS` (`<worker>-email-events`), through the sending domain's event
subscription, a setup step in the dashboard. The Worker's queue handler sends that queue's batches
to `handleEmailEvents`, which hands each message to core's consumer, `core.email-events`
(`layers/core/server/email-events.ts`), with a unit of work of its own. The consumer answers
`'done'` (the unit commits and the message is acknowledged) or `'not-yet'` when the send is not
recorded yet, since an outcome can arrive 0.6 seconds after `send()`. The message is then tried again
after 5 seconds; a throw waits 30. After five tries the message is set aside in
`<worker>-email-events-dead`. The body names the recipient and the subject, so only the queue
message's id and the event's type are ever logged.

### The content store

Nuxt Content keeps each collection (the theatre's pages, the menu, redirects, policies) in D1 and
loads a collection, after a deploy changes it, in whichever request first reads it. Its row in
`_content_info` says "not ready" while the load runs, and every other reader waits up to 90 seconds
for it. A load cut short (the visitor left, the request was cancelled) used to leave that row "not
ready" for good: every read of the collection then waited 90 seconds and gave up, so the Admin
overview, whose site-readiness count reads the pages, never finished loading. The minute's cron
tick now mends the store (`layers/core/server/content-store.ts`): a row still "not ready" two
minutes after the tick first saw it is deleted, so the collection is loaded again from scratch, and
the tick then asks for one row of every collection, so the load after a deploy runs in the tick
rather than in a visitor's request. Separately, a count (`core.count`) that has not answered in three
seconds reads as zero, so no count can hold up a home page or a menu.

## Public components

A module offers a component to the fork's Markdown pages through `core.public-component`:
`{ id, component: 'CoreAccessApplication', alias: 'access-application' }`. The component's own name
starts with its module's name; the alias is what a content file writes (`::access-application`),
kebab-case, unique across modules and never an HTML element's name. The build refuses a clash, and
the core layer registers the component a second time, globally, under its alias.

## Policies

A policy (the privacy notice, the terms of use, the house rules) is a page at `/policies/<id>` put
together from Markdown sections. A module declares a policy with `core.policy` (id, title, summary,
order, and kind: `notice`, `terms`, `rules` or `statement`). Core declares `privacy`, `terms`,
`accessibility` and `visiting`. Every policy is linked from the footer and listed at `/policies`.

**Sections.** Any module adds a section to any policy by keeping a file at
`layers/<module>/content/policies/<policy>/<section>.md`; it shows while the module is on. A section
is one heading and its text. Its front matter is deliberately small, one `key: value` a line:

```md
---
title: At the bar
order: 110
revised: 2026-11-18
law: gb
when: 'setting="bar.age-check.description" is="true"'
---
```

`order` places the section among every module's. `revised` is the date the wording last changed in a
way a reader would care about; the page shows the latest. `law` is `any` (the default) or the
two-letter country whose law the section states: it shows only while `core.organisation.country` is
that country. `when` holds one or more conditions split by semicolons. `must-write: true` marks a
section upstream cannot honestly write for a theatre (how the site was tested): it is left off the
page until the theatre writes its own.

**Values that cannot drift.** A section never states a figure the console can change:

- `:setting{name="core.sessions.lifetime"}` quotes a public, quotable setting. A setting with no
  value until the theatre sets one must sit inside `::when{has="..."}` or carry a `fallback="..."`.
- `:fact{name="payments.card-providers"}` quotes a value worked out from the system's state, which a
  module contributes to `core.policy-fact` (a file whose `value()` answers `{ value, text }`).
- `::when{...}` … `#otherwise` … `::` shows text only while a condition holds. A condition tests one
  of: `setting="…"` with `is`, `not` or `above`; `has="…"` (the setting has a value); `module="…"`
  (the module is on); `fact="…"` with `is`, `not` or `above`.
- `::policy-table{kind="…"}` draws a table built from what modules declare: `privacy-records`
  (`core.privacy-record`), `cookies` and `browser-storage` (`core.browser-storage`), `suppliers` and
  `supplier-cookies` (`core.supplier`). A time in those declarations may be the key of a quotable
  setting, whose live value is shown.

A section quotes only core's settings and its own module's, since another module may be off.
`bun run check` fails a section that quotes or tests something unknown, not public, or possibly empty.

**The theatre's own words.** A theatre never edits upstream's files. A file at
`site/content/policies/<policy>/<section>.md` with the same name as an upstream section replaces it
(keeping its place, conditions and law unless it states its own); a new name adds a section;
`hidden: true` with a one-line `reason` drops one. `based-on: <hash>` records the upstream text a
replacement was written against, so a later change upstream can be pointed out. A folder holding
`_policy.md` (title, order, kind) declares a policy of the theatre's own.

**How it is put together.** The build collects every section into `.generated/policies.ts`
(`#policies`). `layers/core/server/policies/service.ts` decides which sections apply today;
`layers/core/shared/policies.ts` holds the pure rules, shared by the checks, the server and the
page, and `renderPolicy` writes a policy as plain Markdown with every value filled in. The page
draws each section from the `policies` content collection, so tokens show live values.

**Versions.** `core_policy_versions` keeps a policy's whole text as it read at one time. A version is
written the first time the text is found to differ from every version kept (`currentVersion` in
`layers/core/server/policies/versions.ts`, and hourly by `core.record-policy-versions`), so a change
of wording, of a quoted setting or of which modules are on each makes one. Versions are listed at
`/policies/<id>/versions`. What a person agreed to points at a version: a module calls
`currentPolicyVersion('<policy>')` from `#modules/core` and stores the id, as the box office does on
an order (`terms_version_id`) at checkout and when reserving, and core does on an account when a
person first makes it theirs.

**Readiness.** Site readiness lists what the policies still lack
(`layers/core/server/policies/readiness.ts`): sections only the theatre can write, replacements the
default wording has moved on from, facts the text would state if they were set, and default text
not yet named in `core.policies.reviewed`.

Not built yet: telling people when a policy they agreed to changes, and packs of law for countries
other than the UK.

## External calls

`externalCall(name, { reference, call })` records the attempt, makes the call with an idempotency
key, then records the outcome and applies it through the module's `outcome` handler. A call that
throws or times out leaves the attempt with no outcome; the `reconcile` handler asks the provider
later. Nothing is shown as done before its outcome commits.

## Realtime

News pushed to open pages over a WebSocket, so two devices stay in step without asking
(`#kit/realtime`, modelled on Mailflare's RealtimeHub). It is a hint to read again, never the
record: every page that listens must still be right, only slower, without it.

- **Rooms.** A room is one `RealtimeHub` Durable Object (binding `REALTIME`, exported from
  `layers/core/server/entry.ts`). Every account has its own, `accountRoom(accountId)`, which each
  of its devices joins. Sockets hibernate, so a quiet room costs nothing.
- **Tickets.** A page posts to `/api/core/realtime/ticket` for a ticket: a claim to one room,
  signed with `CORE_SESSION_KEY` and good for a minute. It opens `/api/realtime?ticket=...`; the
  Worker's entry checks the ticket and hands the socket to the room. Nitro is not involved, since
  it cannot pass a socket back.
- **Publishing.** `publish(room, channel, data?)` after the commit (`unit.afterCommit`). It never
  throws. Payments' `sessionChanged(unit, sessionId)` is the pattern: it tells the seller's room
  that `payments.session` changed, and the till reads its session again.
- **Listening.** `useRealtime(channel, on)` in a component: one socket for the page, shared by
  every listener, with a heartbeat and reconnection. `on` is called with the news, or with `null`
  when the socket comes back after a gap. `connected` says whether news is arriving, so a page
  that polls can stop while it is and carry on by itself when it is not.
- **Devices.** A device is a browser, with an id and a name kept in its own storage. The room
  says who is in it (`devices`), and devices talk to each other on channels named `device.*`:
  `send(data, { keep })` passes a message to the others, and with `keep` the room holds it for a
  device that arrives later (`ask()`, or starting to listen, brings it marked `kept`). The room
  forgets what it kept when the last device leaves. A device cannot publish on any other channel.
  The till's linked sale (`device.payments.till`, in `PaymentsTill.vue`) is the pattern: each
  message is the whole sale with a revision number, the newest wins, and money is never passed
  this way. A till panel must take up a `modelValue` it did not emit (Bar's `adopt`, Box office's
  `restore`).
- **Another account's room.** A module that has decided an account may join another's room signs
  it a grant (`signGrant({ room, accountId, expires })`); the page keeps it and passes it to
  `useRealtime(channel, on, { grant })`, and the ticket route trades it for tickets to that room
  while it lasts, for that account only. A grant carries no authority beyond hearing and speaking
  in the room. `holdUnder(code, value, until)` and `heldUnder(code)` hold a value under a short
  code for someone to type, with no table behind it. The till's link code
  (`layers/payments/server/till-link.ts`) uses both: a six digit code, good for two minutes, buys
  a pass to the seller's room for twelve hours.
- **Without the binding** (`nuxt dev`) the ticket route answers `available: false` and pages keep
  to their own reads.

## Signing

A module that issues codes a device must check with no connection (door codes, membership cards)
declares a purpose and signs under it; the kit owns the keys (F-37):

```ts
signing: [{ purpose: 'box-office.door-code', rotateEvery: '90d', keepFor: '1460d' }],
```

```ts
import { signing } from '#kit/signing'
// What is signed may name the key: pass a function of the key id, and the key named is the one that signs.
const { keyId, signature } = await signing.sign('box-office.door-code', keyId => `tkt.${keyId}.${code}`)
const genuine = await signing.verify('box-office.door-code', keyId, `tkt.${keyId}.${code}`, signature)
const keys = await signing.publicKeys('box-office.door-code') // for the device's offline data
```

- Keys are ECDSA on P-256 with SHA-256 (`ES256`). A signature is 64 bytes (r and s), base64url; a
  public key is the 65-byte uncompressed point, base64url, which a browser imports with
  `crypto.subtle.importKey('raw', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])`.
- The first signature under a purpose makes its key. The daily task `core.rotate-signing-keys`
  makes a new current key every `rotateEvery`; the old key then only checks, for `keepFor` counted
  from when it stopped signing, so anything signed can be checked for at least `keepFor`. After
  that it is retired and checks nothing.
- The private part is sealed with `CORE_ENCRYPTION_KEY` in `core_signing_keys` and never leaves it.
  It is erased as soon as the key stops signing. Public parts are kept for ever.
- An Owner can retire a key at once (`POST /api/core/signing-keys/:id/retire`, ability
  `core.signing-key.retire`). Without `{ confirm: true }` it refuses with
  `core.signing-key.confirm-needed`, whose reason says what retiring would invalidate. Retiring the
  current key makes a new one straight away. `GET /api/core/signing-keys` (`core.health.view`)
  lists the keys in use with their dates and the same sentence, for the Health screen.
- A route signs only under its own module's purposes. A module that adds a kind of code to another
  module's point signs through that point, so the host makes the call.
- A signature proves the theatre issued a code. It does not prove what the code stands for is still
  valid, and a signed code is not a secret.

## Secrets and keys

A module declares what it reads under `secrets` (Worker secrets, set in the Cloudflare dashboard) or
`credentials` (keys typed into the app). Only `CORE_ENCRYPTION_KEY`, `CORE_SESSION_KEY` and the
break-glass `CORE_OWNER_RECOVERY` are secrets; every other key is a credential (Matt, 17 November),
and nothing the site can hold is set on the Worker (Matt, 19 November). A new module declares no
secret unless the app cannot run, or cannot be recovered, without it.

```ts
credentials: {
  MEMBERSHIP_LIST_KEY: credentialDecl({ needed: 'when-used', manage: 'membership.verification-list.manage', confirm: true }),
},
```

- `credential(name, scope?)` reads it: the value saved for `scope` (a record, such as a payment
  provider account), then the one saved for the whole site. It never reads the Worker. A site set up
  before 19 November may still hold a credential as a Worker secret of the same name: the minute's
  cron tick saves each such value into the app once, where nothing is saved yet (audited by name),
  and copies a `NUXT_PUBLIC_TURNSTILE_SITE_KEY` variable into `core.sign-in.turnstile-site-key`.
  After that the Worker copies are unused and can be deleted. Values are sealed with `CORE_ENCRYPTION_KEY` in
  `core_credentials`; only the last four characters of a long one are kept in the clear, as a hint.
- `manage` names the ability that may save or remove it on the shared keys form. A page shows that
  form with **KeysCard** and the names it manages (`<KeysCard :names="['MEMBERSHIP_LIST_KEY']" />`);
  it loads through `GET /api/core/credentials?names=`, saves through `POST /api/core/credentials`
  (`{ keys: { NAME: value | null } }`, null removes), asks for a fresh sign-in and audits each by
  name, never value. Keys the viewer may not manage are left out. Labels are
  `<module>.credentials.<name>.label` and `.help`, the name lower-cased and kebab-cased without the
  module's prefix (`membership.credentials.list-key.label`).
- `confirm: true` is for a key whose replacement breaks what the old value made: the form asks
  first, with `<module>.credentials.<name>.replace-warning`.
- A credential saved per record on its own screen leaves `manage` out and saves through its own
  route with `setCredential` and `clearCredential`, as Payments does for each provider account's
  keys, drawing the fields with **CredentialFields**. The module's "Set up" card asks for one only
  while a record in use lacks it: the module contributes to `core.credential-use` a file whose
  `missing()` answers those names (Payments: the keys an active provider account lacks). With no
  contribution, a per-record `when-used` credential is never asked for there.

## Settings

```ts
defineSettings('box-office', {
  'holds.length': setting.duration({ default: '15m', min: '5m', max: '1h', change: 'box-office.settings.manage' }),
})
```

Read with `await useSetting('box-office.holds.length')` on the server (seconds for a duration);
components use `usePublicSettings()`, which sees only public settings. A value outside the limits
cannot be saved. A quotable public setting can be quoted in content as
`:setting{name="box-office.fees.booking"}`. `onChange: 'reason'` makes a change need a written
reason and `onChange: 'confirm'` a second confirmation; the `change` ability still decides who may.
Saving a setting asks for a fresh sign-in (`core.access.fresh-within`) only when it declares
`onChange`, whatever the ability's own `fresh` says (Matt, 16 November); `can(..., { fresh })`
is the override, and only the kit's settings code may pass it (the conformance run checks). It
changes freshness alone: a privileged ability still needs a strong sign-in. Reads never ask for a
fresh sign-in (Matt, 17 November): a route answering a GET or HEAD sets `reads` on the context and
`can` then skips freshness, so a screen loads, and flags such as `canChange` hold, however long ago
the person confirmed; the save or action asks. A setting that a table's
`retention`, or a column's `retain until`, names is a retention period and always confirms: the
registry makes it `onChange: 'confirm'` unless it asks for a reason. A section is reset by saving it with
`reset: true` on each of its settings.

`whenModule: 'membership-fees'` says a setting only applies while that other module is on: the settings
screens and their search leave it out while the module is off (the value is kept, and `useSetting`
still reads it). Use it for a setting a feature of the other module needs, not to hide a module's own.

Durations may also be written `6mo` or `7y`; a month is 30 days and a year 365. `formatDuration`
and the `DurationInput` component (a number and a unit, `v-model` in seconds, `min` and `max` as
seconds or written durations) show a value in the largest unit that divides it exactly, and the
control offers only units that can hold a value between the limits. A setting counted in days names
its units, `units: ['week', 'day']`, so its control offers no hours or seconds. A duration setting's label and
help never name a unit, since the control does; the conformance run checks.

Every change is in `core_setting_changes`. `GET /api/core/settings/history` lists them newest first,
filtered by `key`, `module`, `page` and `actor`, paged with `before`; the whole history needs
`core.audit.view` and each search is audited, while one setting's history is open to whoever may
change it. Each settings item carries `lastChange`. `POST /api/core/settings/history/<id>/revert`
sets the value back through the ordinary save, with the reason "Reverted"; back to the default is a
reset, and a sensitive setting has no Revert.

`core.lists.page-size` (25, 50 or 100, Advanced) is how many rows a list shows when its address
gives no size.

### Pages of settings

Where settings are shown is declared per group (the first part of a short key), never per setting;
`scope` is refused. Every setting has exactly one home, a generated page or a bespoke screen:

```ts
settingPages: { desk: { place: 'admin', group: 'modules', order: 20 } },   // makes the page and its entry
settingGroups: {
  'items': { page: 'desk' },                // a page of the module's own
  'retention': { advanced: true },          // the shared Advanced page, under Upkeep
  'sending': { screen: '/admin/email' },    // a bespoke screen manages it; no generated page draws it
},
```

A group not named is on the module's own page: the Settings tab of the module's page in Admin,
`/admin/modules/<module>`, which console staff open from the cog on the module's console pages.
`place` is always `admin`: no page of settings is made in the console. A named `admin` page is another
tab, at `/admin/modules/<module>/<page>`; `about` is reserved for the About tab. Core has no page of its own, so
each of its groups names a home; the table is `layers/core/module/settings.ts`. A single setting may
carry `screen` where only part of its group is bespoke. A setting or group names a screen only once that screen shows and saves it: no setting may be reachable only through the API. Page ids are `<module>.<page>`, plus
`core.advanced` and each module's `<module>.admin`. A page's name is
`<module>.settings-pages.<page>`. The conformance run fails for a screen that is not a page. In
code, `useRegistry().settingPages` and `.settingHomes` say where everything is.

A renamed setting carries `replaces: '<old full key>'`: the old key's stored value is carried over,
`useSetting` still answers to the old key, and the old row goes when the setting is next changed.

The core's locale settings are `core.site.name` and `core.locale.time-zone` (both unset until
setup), `core.locale.currency` (GBP), `core.locale.language` (en-GB) and `core.locale.day-start`
(04:00). Until the time zone is set, scheduled tasks run on UTC and `today()` and `localDate()`
refuse rather than give a date in the wrong zone.

## The interface

Screens use Nuxt UI v4 components first, on Tailwind CSS v4, as in Mailflare; reach for custom
markup only where Nuxt UI has nothing suitable. The core layer registers the module, its stylesheet
(`layers/core/app/assets/css/main.css`) and the shared component defaults (`app.config.ts`).
Icons are bundled at build time, so nothing is fetched from Iconify while the Worker runs.
Shells, page types and the navigation declaration are in [interface.md](interface.md).

## Testing

Unit tests run in Node; integration tests run in workerd with a local D1, using the fixture
modules in `tests/fixtures/modules` (their migrations are in `tests/fixtures/migrations`,
written with `bun run db:generate -- --name <what> --owner fixtures`). Browser tests run the built
Worker under wrangler. Everything runs on Linux.

In an integration test that calls a route, send a `Host` header (the `call()` helper does): h3
builds the request URL from it, and without one origin checks see `localhost`.

## Measurements still owed

- **Building a large set in the Worker.** Rule U9's limits were measured on 2026-11-16 on a
  throwaway D1 through the HTTP query API: a unit writing a 10-column domain set with its events,
  listener jobs and audit took 386 ms at 500 rows, 514 ms at 2,000 and 1.1 s at 8,000, with no
  statement over 77 ms. The Worker's own processor time and memory to build the JSON parameters
  were not measured, and the free plan gives a Worker little processor time, so the default stays
  at 500. Measure that at the first deployed site before raising it.

## Where the build departs from the specification's wording

These were settled while building and accepted by the Foundations workstream, which records them
in the specification's "As built" list; this guide is the reference from here on:

- `defineTable(name, columns, options)`, as ruled for scoped ids; the worked example's older order
  `(name, options, columns)` is not supported.
- The content token is `:setting{name="..."}` rather than `:setting{key}`, because `key` is
  reserved in Vue and never reaches the component.
- Points are read with `usePoint(name)`; `point()` is the manifest helper that declares one.
- Cross-setting rules are declared in the manifest field `settingRules`. A save of several settings
  (`changeSettings`, and `PUT /api/core/settings`) checks each module's rules once, against all its
  changes together, so dependent settings save in one go in any order. A rule that already failed
  before the save does not block it; one the save breaks is refused, naming in `fields` the change it
  blames (the first whose removal lets the rule hold) as well as `value`.
- The jobs of a switched-off module wait (M4) rather than run.
- External calls are declared in the manifest's `calls` section, each with a handler file.
- Sweeps (stuck jobs, lost messages, reconciliation) run inline in the minute's cron tick; pruning
  old history is the daily task `core.prune-history`.
- Rate limits (F-36): each class's allowance is the `rate` setting `core.rate-limits.<class>`, a
  count in a period. Email sign-in counts three ways apart: `sign-in-network` per network address
  on the public sign-in routes (high, as a students' union shares one address), `sign-in-link` per
  email address asking for a link and `sign-in-code` per email address trying a code; `sign-in`
  covers the other identity routes. A route's refusal says how long to wait (`waitRemedy`). The
  sign-in classes, `public-form` and `presented-value` count in the RateLimitCounter
  Durable Object (binding `RATE_LIMITS`), one object per class and caller, shared by every
  instance; the others count in memory in each instance. Cloudflare's rate limiting binding was
  evaluated and not used: its period is fixed at deploy to 10 or 60 seconds and its counts are
  approximate and kept per location. Call `countAgainstRate(class, who)`; it answers
  `{ allowed, retryAfter }`.
- Pending migrations are applied automatically only where `PROSCENIUM_AUTO_MIGRATE=1` (dev,
  preview and tests). It is not a production option and is removed when F-28's maintenance page
  and Apply button land.
- In phase 1 `notifyAddress` sends at once, inside the caller's job, so the job's lane is the lane;
  a notification type's `lane` takes effect with the full pipeline in phase 2.
- An upload is one request carrying the bytes, rather than a begun upload and a second request.
- `core_notifications` has the account as its subject; the spec's `{ account, email }` subject
  is not a form the kit allows, and the `address` column is used only once `notifyAddress` joins
  the pipeline. Phase 1's `notifyAddress` still sends at once and records nothing.
- The suppression list's keyed hash uses `CORE_SESSION_KEY`, so rotating that secret empties
  the list in effect.
- Digests are not built yet: a preference of `daily` or `weekly` is treated as `immediate`.
- On a merge, a notification preference moves to the survivor unless the survivor has one for the
  same topic and channel, which stands; it is not restored by undoing the merge.
- Vocabulary terms keep `slug`, `label`, `description` and `icon` as public columns rather than per-row
  columns classed by the vocabulary's `term_class`: a per-row column needs a subject, which
  `core_terms` does not have. No vocabulary core ships is internal; one that is waits on the kit
  supporting a class taken one hop away.
- A vocabulary is made when its module is switched on (the `core.module.enabled` listener) and,
  for modules that are always on, the first time any vocabulary is read.
- A file with `record` access is not served until a module answers `core.file-access`.
- The theatre's own files (its logos) have the owner `site`, so there is no `core.branding` record.
- A set given to `announce` is a list of `{ payload, record? }`, since each event may name its own
  record. `insertSet` has no conflict clause: a caller that must skip rows already written (a
  notification's dedupe key) reads them before building the unit and guards the set with
  `expect(n)` (U2, U4), so a duplicate written meanwhile rolls the unit back and the job retries.
- Not yet checked by `bun run check`: the erasure scan, soft-dependency switching and navigation
  coverage, which need the modules they check.

### Content warnings, staging effects and age

Built as the content warnings slice (core spec part 2, "Later slice"). Where it departs from, or is
narrower than, the specification:

- **Existing sites.** The migration moves the four effect terms out of `core.advisory` into a new
  `core.staging-effect` vocabulary (ids unchanged), moves their rows to `core_production_effects`,
  grades every other warning `depicted` with `level_assumed`, and converts numeric `age_guidance`.
  Text it cannot convert is appended to the content note. The first `ensureVocabularies()` after that
  adds the headings, the starting terms a site lacks, and an "Other" heading for terms the theatre
  made itself (`adoptHeadings`).
- **Reads.** `guidanceFor` and `beforeYouCome` are in `layers/core/server/programme/guidance.ts`.
  `notAtThisPerformance` is always empty until performance exceptions (story C-55) are built.
  A merged term is folded in the read, by `merged_into_id`, because term merging has no screen yet.
- **Event.** `core.production.updated` carries `guidanceAdded: { effectTermIds, warnings }`; the
  payload rules require ids to be named `...Id`, so the effects list is `effectTermIds`.
- **Public page.** `ageGuidance` stays as a worded string for older callers; `ageMin`, `ageRestricted`,
  `effects` and graded `advisories` are new. A warning still `level_assumed` shows no level word.
- **Tooling.** `bun run db:generate -- --hints '<json>'` passes Drizzle Kit's rename-or-create answers
  through, which it needs when a column appears and there is no terminal to ask in.
