# Module manifest

The manifest is one TypeScript file per module, `layers/<id>/module.ts`, whose default export is `defineModule({...})`. It is pure data: the build, the lint rules, the checks and the running app all read the same object.

## The shape

```ts
// layers/box-office/module.ts
import { defineModule } from '#kit'
import { settings } from './module/settings'
import { abilities, facts, records } from './module/abilities'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'box-office',
  manifest: 1,
  since: '0.3.0',
  stability: 'stable',
  requires: ['payments', 'finance'],
  uses: ['membership'],

  settings,
  abilities,
  facts,
  records,
  tables,

  events: { announces: { /* ... */ }, listens: { /* ... */ } },
  jobs: { /* ... */ },
  tasks: { /* ... */ },

  points: { /* ... */ },
  contributes: { /* ... */ },

  secrets: { /* ... */ },
  presets: { /* ... */ },
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
| `requires` | module ids | Hard dependencies. See below |
| `uses` | module ids | Soft dependencies. See below |
| `settings` | map of key to entry | See the Settings registry sub-tab |
| `abilities`, `facts`, `records` | maps | See the Abilities registry sub-tab |
| `tables` | map of table name to table | See the Data-class registry sub-tab |
| `events.announces` | map of event name to `event({...})` | Events this module may announce, each with a payload schema |
| `events.listens` | map of event name to listener name | Events it reacts to. The listener is `server/listeners/<name>.ts` |
| `jobs` | map of job name to `job({...})` | Background work it queues for itself. The handler is `server/jobs/<name>.ts` |
| `tasks` | map of task name to `task({...})` | Scheduled work. The handler is `server/tasks/<name>.ts` |
| `points` | map of point name to `point({...})` | Extension points it offers to other modules |
| `contributes` | map of point name to a list of contributions | What it adds to its own or other modules' points |
| `secrets` | map of secret name to `secret({...})` | Worker secrets it reads |
| `presets` | map of preset id to defaults | Whether it starts switched on, setting values and role mappings for each theatre type |

One more field, added after draft 1: `switchable` (default `true`). `switchable: false` marks a module that has its own layer, id and prefix but is always on, as `forms` is. Any module may list it in `requires` at no cost. The core itself is the only module with the id `core`; identity, the core domain and the interface are areas inside it.

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
- A soft link always runs through a point, an event or a fact. Front of house offers the point `front-of-house.eligibility`; Training lists `front-of-house` in `uses` and contributes a rule to it. Front of house never names Training.

When a module named in `uses` is switched off, nothing throws. Its points have no contributions from it, its facts grant nothing and its events never arrive. Code written against a `uses` link must read correctly with an empty list.

## Events

```ts
events: {
  announces: {
    'box-office.order.paid': event({
      version: 1,
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

## Jobs and scheduled tasks

```ts
jobs: {
  'communications.send-email': job({
    payload: z.object({ messageId: z.string() }),
    retries: 5,
  }),
},
tasks: {
  'box-office.sweep-holds': task({ every: '5m' }),
  'box-office.send-reminders': task({ dailyAt: '09:00' }),
},
```

- The Worker has **two queues, one per lane** (each with a dead-letter queue) and **one cron trigger**, both owned by the core. Jobs and tasks are entries inside them, so the deploy configuration never changes when a module is added.
- A job is retried with back-off up to `retries` times, then parked on the dead-letter queue and shown on the health screen.
- A task's `every` is a whole number of minutes or hours. `dailyAt` is a time in the theatre's time zone, which a raw cron expression cannot express.
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
    shell: 'console',
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
| `core.navigation` | data | One menu entry: shell, destination, icon, the ability that shows it, order |
| `core.setup-step` | data | One step of a module's guided setup: id, whether it is required, the page that performs it |
| `core.health-check` | code | A check shown on the health screen, such as "the card reader answered today" |
| `core.erasure-handler` | code | Extra erasure work the data-class registry cannot express, such as deleting a file |
| `core.record-resolver` | code | Turns a record id into a title and a link, for audit, search and notifications |

`core.privacy-record` (code) was added after draft 1: a module returns entries for the record of personal data held that the schema cannot know, such as the form builder's per-field classes.

A `core.navigation` entry, as agreed with workstream 6:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Unique within the point |
| `shell` | Yes | `account`, `members`, `console` or `live` |
| `to` | Yes | The address it opens |
| `icon` | Yes | A bundled icon name |
| `ability` | Yes | One ability, or a list meaning any of them. Never a fact name: a fact shows an entry by being mapped to the ability |
| `order` | No | Position within its group |
| `group`, `section` | No | Console sidebar grouping; `section` is `everyday` or `setup` |
| `count` | No | A registered count name, shown as a badge |
| `match` | No | The address prefix that marks the entry as current |

Reserved address prefixes are `/account`, `/members`, `/console`, `/live`, `/book`, `/sign-in`, `/setup`, `/api` and anything starting with an underscore. Everything else at the root belongs to the theatre's own pages, and a check refuses a page in `site/` under a reserved prefix. Workstreams 2, 3, 5 and 6 declare further `core.*` and `forms.*` points; part 4 keeps the index.

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

## Presets

```ts
presets: {
  'student-society': {
    on: true,
    settings: { 'box-office.holds.release-before': '30m' },
    roles: { 'box-office-manager': ['box-office.order.sell', 'box-office.order.refund'] },
  },
},
```

Preset ids are `student-society`, `amateur-company` and `small-venue`. A preset is applied once, at first-run setup or when a module is first switched on, and only fills values the theatre has not set. Role names in `roles` come from workstream 2's list.

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

A check fails when the manifest names a handler file that does not exist, or a handler file exists that the manifest does not name. A theatre's own module has the same shape under `site/modules/x-<name>/`.

**Published components.** Components in `app/components/public/` are part of a module's public interface and may be used by modules that list it in `requires`. Everything else under `app/` is private. Every component's name starts with the module id in PascalCase (`FormsSlot`, `BoxOfficeSeatPicker`), so two modules cannot collide in auto-import. Changing a published component's props is a breaking change, like changing a service's signature.

## What switching a module off does

| Part | When the module is off |
| --- | --- |
| Tables and data | Kept, untouched. Every module's tables exist in every deployment |
| Routes and pages | Answer 404 |
| Navigation, setup steps, contributions | Removed |
| Scheduled tasks | Skipped |
| Listeners | Not called |
| Jobs already queued | Still run, so an email for a booking already made is still sent |
| Facts | Grant nothing |
| Settings | Kept, hidden |

Switching on never runs a migration and switching off never deletes anything, so both are instant and reversible.

## Later rulings that apply to this tab

Added after this tab was written; the full list is at the end of the Formats tab and prevails over any wording above. For the manifest: tasks may be weekly (`weeklyOn: { day, at }`); `/files` is a reserved prefix; a `credentials` section sits beside `secrets` for keys entered in the console; a theatre's own modules live in `site/layers/x-<name>/`; and a route declaration may carry `protect: 'turnstile'`.
