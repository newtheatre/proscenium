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
  finder: col.account('finder_id', { role: 'subject', onMerge: 'move' }),
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
`col.special()` always is. After changing a table run `bun run db:generate -- --name <what>`;
the conformance check fails while the code and the migrations disagree.

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
naming the fields), so a caller without the ability learns nothing about the input. Every refusal has the body `{ code, reason, remedy?, fields? }`. The kit commits the unit
of work after the handler returns, with an audit entry when the ability is audited.

A route that takes a file's bytes declares `body: 'binary'`: the kit leaves the body unread for the
handler (`readRawBody(event, false)`) and validates the query against `input` instead. Such a route
cannot be idempotent.

## Core's services

Any module may import core's services without listing core: `import { notifyAddress } from
'#modules/core'`. In roadmap phase 1 they are:

- `notifyAddress(unit, typeKey, { address, variables, locale?, dedupeKey? })` sends one
  transactional email from inside your job. Declare the type as a contribution to
  `core.notification-type` (wording inline, variables `url` or `text`, `{{ theatre }}` filled by
  core). It throws on failure, so your job retries; nothing is sent until the sending domain is set
  and verified. In tests, `setMailer(fn)` from `layers/core/server/notifications/mailer.ts`
  records messages instead of sending them.
- `operatingDayOf(instant)` and `dayBounds(day)`: the theatre's operating day, which rolls over at
  `core.locale.day-start`. A table that stores one contributes to `core.operating-day`, so
  it is recalculated when the time zone or the rollover changes.
- `attachFile(unit, fileId, { slot, ownerType, ownerId })` and `detachFile(unit, fileId)`. Declare
  where your records hold files as contributions to `core.file-slot`; uploads go to
  `POST /api/core/files?slot=<id>&owner=<record id>` and are checked and cleaned by a job.
- `getBrand()`: the theatre's name, logos and colour tokens for light and dark.
- Vocabularies, the shared lists of options such as production categories and advisories. Declare
  yours, with its starting terms, as a contribution to `core.vocabulary` (`id` is
  `<module>.<name>`); it is made the first time the module is on and from then on its terms are the
  theatre's. A record stores the term's id in a `col.ref('core_terms')` column, never the label.
  `listTerms(key, { includeRetired? })` gives a picker's options in order; `getTerm(id)` gives a
  label for any term, retired or merged ones too; `assertTerm(id, key)` is the predicate to put on
  your own insert or update, then `.expect(1)`, so a retired term or one from another vocabulary
  is refused. Staff edit terms at `/console/system/vocabularies`; a term in use can be retired but
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
delivered as its own event. A set holds at most `core.units.set-rows-limit` rows (500, provisional
until measured on a real D1); larger work is a job in chunks. Job messages go to the queues a
hundred at a time.

## Events, jobs and tasks

`unit.announce(name, payload)` writes the event and, in the same batch, a job for each listener in
a module that is switched on. Payloads hold ids, numbers, enums and `code()` values only, never a
person's words. Jobs run from two queues (`prompt` and `bulk`); the job row is the truth, so a
duplicate message runs once and a lost one is sent again by the sweep. A failed job is retried
with back-off (`core.jobs.backoff`) and is dead after its attempts, announcing `core.job.died`.
Core alone may declare `events.listens: { deliverable: '<listener>' }`, the listener on
`'deliverable'`: it hears every event not marked `internal: true`, for the webhook sender. Stored states are queued, running, done, dead and cancelled; `cancelJob` (route
`POST /api/core/jobs/<id>/cancel`, ability `core.job.manage`) cancels a job that has not started. A
switched-off module's jobs wait. Tasks are declared with `every`, `dailyAt` or `weeklyOn` in the
theatre's time zone (UTC until setup sets it); the cron trigger runs only the latest due slot, once.

## Modules, records, facts and pages

`uses` may name a module that is not written yet if the design has reserved its id
(`RESERVED_MODULE_IDS` in the registry); listening to it or contributing to its points then does
nothing. A record type may have no table and a fixed list of ids (`record({ ids: ['site'] })`). A
fact resolver may give the accounts that hold it, `defineFact(resolve, { holders })`, read with
`factHolders(name, record?)`; without it the fact cannot be enumerated. A `core.navigation` entry
names a `menu` (account, members, console or live) and may set `hideEmpty` beside `count`; only an
account entry may use the ability `'signed-in'`. A theatre's page may not sit under a reserved
address prefix (`RESERVED_PREFIXES` in `scripts/checks/routes.ts`) or start with an underscore.

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
and audits the read.

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

## Public components

A module offers a component to the fork's Markdown pages through `core.public-component`:
`{ id, component: 'CoreAccessApplication', alias: 'access-application' }`. The component's own name
starts with its module's name; the alias is what a content file writes (`::access-application`),
kebab-case, unique across modules and never an HTML element's name. The build refuses a clash, and
the core layer registers the component a second time, globally, under its alias.

## External calls

`externalCall(name, { reference, call })` records the attempt, makes the call with an idempotency
key, then records the outcome and applies it through the module's `outcome` handler. A call that
throws or times out leaves the attempt with no outcome; the `reconcile` handler asks the provider
later. Nothing is shown as done before its outcome commits.

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

## Where the build departs from the specification's wording

These were settled while building and accepted by the Foundations workstream, which records them
in the specification's "As built" list; this guide is the reference from here on:

- `defineTable(name, columns, options)`, as ruled for scoped ids; the worked example's older order
  `(name, options, columns)` is not supported.
- The content token is `:setting{name="..."}` rather than `:setting{key}`, because `key` is
  reserved in Vue and never reaches the component.
- Points are read with `usePoint(name)`; `point()` is the manifest helper that declares one.
- Cross-setting rules are declared in the manifest field `settingRules`.
- The jobs of a switched-off module wait (M4) rather than run.
- External calls are declared in the manifest's `calls` section, each with a handler file.
- Sweeps (stuck jobs, lost messages, reconciliation) run inline in the minute's cron tick; pruning
  old history is the daily task `core.prune-history`.
- Rate limits (F-36): each class's allowance is the `rate` setting `core.rate-limits.<class>`, a
  count in a period. `sign-in`, `public-form` and `presented-value` count in the RateLimitCounter
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
