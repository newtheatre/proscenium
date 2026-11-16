# Module manifest

The manifest is one TypeScript file per module, `layers/<id>/module.ts`, whose default export is `defineModule({...})`. A theatre's own module is the same file at `site/layers/x-<name>/module.ts`. It is pure data: the build, the lint rules, the checks and the running app all read the same object.

## The shape

```ts
// layers/box-office/module.ts
import { defineModule } from '#kit'
import { settings, settingRules } from './module/settings'
import { abilities, facts, records } from './module/abilities'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'box-office',
  manifest: 1,
  since: '0.3.0',
  stability: 'stable',
  switchable: true,
  requires: ['payments', 'finance'],
  uses: ['membership'],

  settings,
  settingRules,
  abilities,
  facts,
  records,
  tables,

  events: { announces: { /* ... */ }, listens: { /* ... */ } },
  jobs: { /* ... */ },
  tasks: { /* ... */ },
  calls: { /* ... */ },

  points: { /* ... */ },
  contributes: { /* ... */ },

  secrets: { /* ... */ },
  credentials: { /* ... */ },
  signing: [ /* ... */ ],
  presets: { /* ... */ },
  switchOff: { /* ... */ },
})
```

Long sections live in sibling files under `module/` and are imported, so the manifest itself stays a page long. Every section except `id`, `manifest` and `since` is optional.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | kebab-case string | The module's name everywhere: table prefix, key prefix, route prefix, folder name. Never changes after release |
| `manifest` | `1` | The version of this format. A change to the format is a breaking change for forks |
| `since` | platform version | The release the module first shipped in |
| `stability` | `experimental`, `stable` or `deprecated` | Shown on the module switch. An experimental module may change its settings and events without a major version |
| `switchable` | boolean, default true | `false` marks a module that has its own layer, id and prefix but is always on, as `forms` is. Any module may list it in `requires` at no cost |
| `requires` | module ids | Hard dependencies. See below |
| `uses` | module ids | Soft dependencies. See below. May name a module that is not yet written if its id is reserved (Formats tab) |
| `settings` | map of key to entry | See the Settings registry sub-tab |
| `settingRules` | list of rules | Rules that span several settings (one must be less than another), checked on every change and on import |
| `abilities`, `facts`, `records` | maps | See the Abilities registry sub-tab |
| `tables` | map of table name to table | See the Data-class registry sub-tab |
| `events.announces` | map of event name to `event({...})` | Events this module may announce, each with a payload schema and, where the record's table has a subject, an explicit `internal: true` or `false` |
| `events.listens` | map of event name to listener name | Events it reacts to. The listener is `server/listeners/<name>.ts`. Core alone may also listen `on: 'deliverable'` |
| `jobs` | map of job name to `job({...})` | Background work it queues for itself, each in a `lane`. The handler is `server/jobs/<name>.ts` |
| `tasks` | map of task name to `task({...})` | Scheduled work: `every`, `dailyAt` or `weeklyOn`. The handler is `server/tasks/<name>.ts` |
| `calls` | map of call name to a declaration | Every call to an outside service that cannot be undone. The file is `server/calls/<name>.ts`, exporting `defineCall({ outcome, reconcile })`; a lint refuses an outside call made any other way |
| `points` | map of point name to `point({...})` | Extension points it offers to other modules |
| `contributes` | map of point name to a list of contributions | What it adds to its own or other modules' points. The core contributes to no module's point |
| `secrets` | map of secret name to `secret({...})` | Deployment secrets it reads |
| `credentials` | map of credential name to an entry | Keys an administrator types into the console, stored encrypted in `core_credentials` and read with `credential(name)` |
| `signing` | list of `{ purpose, rotateEvery, keepFor }` | Each use the module makes of the kit's signing service |
| `presets` | map of preset id to defaults | Whether it starts switched on, setting values and role mappings for each theatre type |
| `switchOff` | `{ impact() }` | Short counted statements of what switching the module off will cost, shown on the Modules screen before the administrator confirms |

The core itself is the only module with the id `core`; identity, the core domain and the interface are areas inside it. The core domain also owns a second, switchable module, `public-site`.

## Dependencies

|  | `requires` | `uses` |
| --- | --- | --- |
| Switching on | Refused until every required module is on | Allowed whether or not the used module is on |
| Switching off the other module | Refused while this module is on, naming it | Allowed; this module carries on without it |
| May call its services | Yes | No |
| May import its types | Yes | Yes, types only |
| May listen to its events | Yes | Yes |
| May contribute to its points | Yes | Yes |

- `core` is always on and never listed.
- `requires` may not form a loop; a check refuses one.
- There is no either-or dependency. Where the catalogue says "Payments needs Box office or Bar", Box office and Bar each list `payments` in `requires`.
- A soft link always runs through a point, an event or a fact. Front of house `stores requirement references and asks core.requirement; Training contributes a source to that point. Front of house never names Training and never calls it`.

When a module named in `uses` is switched off, nothing throws. Its points have no contributions from it, its facts grant nothing and its events never arrive. Code written against a `uses` link must read correctly with an empty list.

## Events

```ts
events: {
  announces: {
    'box-office.order.confirmed': event({
      version: 1,
      internal: false,
      payload: z.object({ orderId: z.string(), performanceId: z.string() }),
    }),
  },
  listens: {
    'core.performance.cancelled': 'performance-cancelled',
  },
},
```

- **Announced inside the unit of work.** The event row is written in the same batch as the change it describes, so an event exists exactly when its change does.
- **Delivered afterwards, at least once.** A listener may be called twice and must give the same result; it receives the event's id to guard on.
- **No order is promised** between events about different records.
- **Payloads carry identifiers, never people.** No names, addresses or free text. A listener that needs detail asks a service.
- **A listener of a switched-off module is not called**, and events announced while it was off are not replayed when it is switched on.
- **Changing a payload:** adding an optional field keeps the version. Anything else is a new version, announced beside the old one for one release.

Every announced event may be delivered to a theatre's webhooks unless it is declared `internal: true`. An internal event still reaches listeners inside the system. Mark an event internal when the mere fact that it happened, with its ids, should not leave the system: anything about a person's standing, welfare, access needs, sign-in, an erasure or data request, or a credential. A lint requires every event on a record type whose table has a subject to state `internal` explicitly.

## Jobs and scheduled tasks

```ts
jobs: {
  'communications.send-email': job({
    payload: z.object({ messageId: z.string() }),
    lane: 'prompt',
    retries: 5,
  }),
},
tasks: {
  'box-office.sweep-holds': task({ every: '5m' }),
  'box-office.send-reminders': task({ dailyAt: '09:00' }),
  'finance.send-summary': task({ weeklyOn: { day: 'monday', at: '08:00' } }),
},
```

- The Worker has **two** **job queues, one per lane (each with a dead-letter queue), a third queue that receives email outcomes from Cloudflare, and one cron trigger, all** owned by the core. Jobs and tasks are entries inside them, so the deploy configuration never changes when a module is added.
- A job is retried with back-off up to `retries` times, then parked on the dead-letter queue and shown on the health screen.
- A task's `every` is a whole number of minutes or hours. `dailyAt` and weeklyOn give a time in the theatre's time zone, which a raw cron expression cannot express.
- A task must be safe to run twice. A missed run is caught up once, not once per missed slot.
- A module does not get its own queue, cron trigger, Durable Object class or other binding. It uses the core's services for background work, live screens, files and cache.

**Lanes.** A job runs in one of two lanes, each its own queue. `lane: 'prompt'` is the default, for work a person is waiting on: a ticket email, a receipt, a notification. `lane: 'bulk'` is for imports, exports, report builds and mailings. A long bulk job can never delay a prompt one, and a bulk job that would exceed one invocation's limits must split itself into further jobs. Event delivery uses the prompt lane.

## Points and contributions

A point is a named, typed socket. Its owner declares it; any module may plug into it.

```ts
points: {
  'payments.provider': point({ kind: 'code', contract: 'provider' }),
},
contributes: {
  'payments.provider': [{ id: 'cash', file: 'cash' }],
  'core.navigation': [{
    id: 'box-office.desk',
    menu: 'console',
    to: '/console/box-office/desk',
    icon: 'i-lucide-ticket',
    ability: 'box-office.order.sell',
    order: 20,
  }],
},
```

|  | `kind: 'data'` | `kind: 'code'` |
| --- | --- | --- |
| A contribution is | A plain object checked against the point's schema | A file that implements the point's contract |
| Contract lives in | `schema` on the point (Zod) | `server/points/<contract>.ts`, a TypeScript interface |
| Contribution lives in | The manifest | `server/contributions/<point>/<file>.ts` |
| Example | A navigation entry | A payment provider |

- The owner reads its point with `usePoint('payments.provider')` and gets the contributions of every module that is switched on.
- Every contribution has an `id`, unique within the point.
- A point works with no contributors. Its owner decides what an empty point means.

Points the core offers in the first release:

| Point | Kind | A contribution is |
| --- | --- | --- |
| `core.navigation` | data | One menu entry: menu, destination, icon, the ability that shows it, order |
| `core.setup-step` | data | One step of a module's guided setup: id, whether it is required, the page that performs it |
| `core.health-check` | code | A check shown on the health screen, such as "the card reader answered today" |
| `core.erasure-handler` | code | Extra erasure work the data-class registry cannot express, such as deleting a file |
| `core.record-resolver` | code | Turns a record id into a title, a link and a parent, for audit, search and notifications |
| `core.privacy-record` | data | Entries for the record of personal data held that the schema cannot know, such as the form builder's per-field classes |
| `core.requirement` | code | A source that judges whether a person meets a stored condition (Formats tab, Requirements) |

A `core.navigation` entry, as agreed with workstream 6:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Unique within the point |
| `menu` | Yes | `account`, `members`, `console` or `live`. These are menus, not shells: the interface has three shells (public, members and console) and a live mode with no navigation of its own; the account menu sits in the public shell |
| `to` | Yes | The address it opens |
| `icon` | Yes | A bundled icon name |
| `ability` | Yes | One ability, or a list meaning any of them, or 'signed-in' for an entry every signed-in person sees (the account menu). Never a fact name: a fact shows an entry by being mapped to the ability |
| `order` | No | Position within its group |
| `group`, `section` | No | Console sidebar grouping; `section` is `everyday` or `setup` |
| `count` | No | A registered count name, shown as a badge. With hideEmpty: true the entry is hidden while the count is nought |
| `match` | No | The address prefix that marks the entry as current |

Workstreams 2, 3, 5 and 6 declare further `core.*` and `forms.*` points; part 4 keeps the index.

## Reserved address prefixes

This is the one list. Every other mention in any document points here.

| Prefix | Belongs to |
| --- | --- |
| `/account`, `/members`, `/console`, `/live` | The menus above |
| `/sign-in`, `/setup` | Identity and first-run setup |
| `/api` | Every module's routes, at `/api/<module>/...` |
| `/files` | Core's file delivery |
| `/whats-on`, `/shows` | The `public-site` module. They stay reserved, and answer page not found, while it is off. `/archive` is not reserved; `/shows` replaced it |
| `/book` | Box office's public pages, including managing a booking and buying a pass |
| `/forms` | A form's own page and its confirmation |
| `/mailing` | Communications' confirm and manage pages, reached by token |
| anything starting with an underscore | The framework |

Everything else at the root belongs to the theatre's own pages. A check refuses a page in `site/` under a reserved prefix, and refuses a module's page outside the prefixes it owns. A new prefix is a change to this table, made by foundations.

Sign-in methods, notification channels, payment providers, membership verification and public-holiday feeds are points too, declared by the workstreams that own them.

## Secrets

```ts
secrets: {
  PAYMENTS_STRIPE_SECRET_KEY: secret({ needed: 'when-used' }),
},
```

| `needed` | Meaning |
| --- | --- |
| `always` | The module cannot be switched on without it |
| `when-used` | Needed only by one contribution, which stays unavailable until it is set |
| `optional` | A feature is quietly off without it, such as Turnstile |

Secrets are Worker secrets, set in the Cloudflare dashboard. They are never settings and never stored in the database. The health screen lists each as set or missing, never its value.

## Credentials, calls and signing

```ts
credentials: {
  'payments.sumup-api-key': credential({ needed: 'when-used' }),
},
calls: {
  'payments.take-payment': call({ file: 'take-payment' }),
},
signing: [
  { purpose: 'box-office.door-code', rotateEvery: '365d', keepFor: '730d' },
],
```

- A **credential** is a key an administrator enters in the console, such as a payment provider's key. It is stored encrypted in `core_credentials` with the one core key, read with `credential(name)`, shown only as set or not set, and audited without its value. A **secret** is set at deployment and is never in the database.
- A **call** declares one kind of request to an outside service that cannot be undone. Its file exports `defineCall({ outcome, reconcile })`, and the call site is `externalCall(name, { reference, key?, attempt?, call })`, the one exception to the unit of work that commits by itself.
- A **signing** entry declares one purpose the module signs under. The kit makes, rotates and retires the keys (Formats tab, signing service).

## Presets

```ts
presets: {
  'student-society': {
    on: true,
    settings: { 'box-office.reservations.release-before': '30m' },
    roles: { 'box-office-manager': ['box-office.order.sell', 'box-office.order.refund'] },
  },
},
```

Preset ids are `student-society`, `amateur-company` and `small-venue`. A preset is applied once, at first-run setup or when a module is first switched on, and only fills values the theatre has not set. Role names in `roles` are identity's fifteen preset roles and no others.

## Files a module keeps

| Path under `layers/<id>/` | Holds | Others may import it |
| --- | --- | --- |
| `module.ts`, `module/` | The manifest and its declaration files | The build only |
| `server/services.ts` | Its public services | Yes, as `#modules/<id>`, if listed in `requires` |
| `shared/types.ts` | Its public types | Yes, if listed in `requires` or `uses` |
| `server/api/<id>/` | Its routes | No |
| `server/db/schema.ts` | Its tables | No |
| `server/listeners/`, `server/jobs/`, `server/tasks/` | Handlers named in the manifest | No |
| `server/points/`, `server/contributions/` | Contracts it offers, implementations it contributes | Contracts only |
| `app/` | Pages, components, composables | No |
| `i18n/` | One catalogue per language | No |
| `docs/` | A page per screen, shipped with the app | No |
| `tests/unit/`, `tests/integration/`, `tests/e2e/` | Its tests, in three tiers | No |

A check fails when the manifest names a handler file that does not exist, or a handler file exists that the manifest does not name. A theatre's own module has the same shape under `site/layers/x-<name>/`.

**Published components.** Components in `app/components/public/` are part of a module's public interface and may be used by modules that list it in `requires`. Everything else under `app/` is private. Every component's name starts with the module id in PascalCase (`FormsSlot`, `BoxOfficeSeatPicker`), so two modules cannot collide in auto-import. Changing a published component's props is a breaking change, like changing a service's signature.

## What switching a module off does

| Part | When the module is off |
| --- | --- |
| Tables and data | Kept, untouched. Every module's tables exist in every deployment |
| Routes and pages | Answer 404 |
| Navigation, setup steps, contributions | Removed |
| Scheduled tasks | Skipped |
| Listeners | Not called |
| Jobs already queued | Wait, unclaimed, until the module is switched on again (rule M4). An email for a booking already made is a job of core's notification service, not of the module, so it is still sent |
| Facts | Grant nothing |
| Settings | Kept, hidden |

Switching on never runs a migration and switching off never deletes anything, so both are instant and reversible.
