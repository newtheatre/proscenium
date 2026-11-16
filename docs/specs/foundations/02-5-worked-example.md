# Worked example

Lost property is an invented module, not in the catalogue, chosen because it is small and touches every part of the format: a setting, abilities, a record type, a table with personal data, an event, a scheduled task, a listener, navigation and a preset. Copy its shape, not its content.

What it does: front-of-house staff log an item found after a performance; the owner claims it; unclaimed items are flagged for disposal after a set time.

## The manifest

```ts
// layers/lost-property/module.ts
import { defineModule, event, task } from '#kit'
import { z } from 'zod'
import { settings } from './module/settings'
import { abilities, records } from './module/abilities'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'lost-property',
  manifest: 1,
  since: '0.6.0',
  stability: 'experimental',
  requires: [],
  uses: ['front-of-house'],

  settings,
  abilities,
  records,
  tables,

  events: {
    announces: {
      'lost-property.item.logged':   event({ version: 1, internal: false, payload: z.object({ itemId: z.string() }) }),
      'lost-property.item.returned': event({ version: 1, internal: false, payload: z.object({ itemId: z.string() }) }),
    },
    listens: {
      'core.performance.cancelled': 'performance-cancelled',
    },
  },

  tasks: {
    'lost-property.flag-unclaimed': task({ dailyAt: '06:00' }),
  },

  contributes: {
    'core.navigation': [{
      id: 'lost-property.items',
      menu: 'console',
      to: '/console/lost-property',
      icon: 'i-lucide-umbrella',
      ability: 'lost-property.item.view',
      order: 60,
    }],
    'core.record-resolver': [{ id: 'lost-property.item', file: 'item' }],
  },

  presets: {
    'student-society': {
      on: false,
      roles: { 'front-of-house-manager': ['lost-property.item.log', 'lost-property.item.return', 'lost-property.item.dispose'] },
      facts: { 'front-of-house.on-shift': ['lost-property.item.log', 'lost-property.item.view'] },
    },
    'small-venue': { on: true, settings: { 'lost-property.items.keep-for': '90d' } },
  },
})
```

It lists `front-of-house` in `uses` only so its preset may suggest abilities for that module's fact. With Front of house switched off, the suggestion is ignored and everything else works.

## Settings

```ts
// layers/lost-property/module/settings.ts
import { defineSettings, setting } from '#kit'

export const settings = defineSettings('lost-property', {
  'items.keep-for': setting.duration({
    default: '28d',
    min: '1d',
    max: '365d',
    change: 'lost-property.settings.manage',
    audience: 'public',
    quotable: true,
  }),
  'items.contact': setting.text({
    unset: true,
    maxLength: 120,
    change: 'lost-property.settings.manage',
    audience: 'public',
    quotable: true,
  }),
})
```

A theatre's lost-property page can then say: "We keep items for `:setting{name="lost-property.items.keep-for"}`." The page shows "28 days" and changes the moment the setting does.

## Abilities and the record type

```ts
// layers/lost-property/module/abilities.ts
import { defineAbilities, defineRecords, ability, record } from '#kit'

export const records = defineRecords('lost-property', {
  item: record({ table: 'lost_property_items', parent: 'core.performance' }),
})

export const abilities = defineAbilities('lost-property', {
  'item.view':       ability({ on: 'lost-property.item', audit: false }),
  'item.log':        ability({ on: 'core.performance', implies: ['item.view'] }),
  'item.return':     ability({ on: 'lost-property.item', implies: ['item.view'] }),
  'item.dispose':    ability({ on: 'lost-property.item', implies: ['item.view'] }),
  'item.redact':     ability({ on: 'lost-property.item', risk: 'privileged', implies: ['item.view'] }),
  'settings.manage': ability({ risk: 'privileged' }),
})
```

## The table

```ts
// layers/lost-property/server/db/schema.ts
import { defineTable, col } from '#kit/db'
import { text } from 'drizzle-orm/sqlite-core'

export const items = defineTable('lost_property_items', {
  id:            col.id(),
  performanceId: col.ref('core_performances', { nullable: true }),
  description:   col.internal(text('description').notNull()),
  foundWhere:    col.internal(text('found_where')),
  state:         col.internal(text('state').notNull()),
  loggedBy:      col.account('logged_by', { role: 'actor', onMerge: 'move' }),
  claimantName:  col.personal(text('claimant_name')),
  claimantPhone: col.personal(text('claimant_phone'), { erase: 'clear' }),
  claimNote:     col.freeText(text('claim_note')),
  returnedAt:    col.timestamp('returned_at'),
  createdAt:     col.createdAt(),
}, {
  id: 'xlpi',
  realm: 'operational',
  subject: { unlinked: 'staff' },
  redact: 'lost-property.item.redact',
  retention: 'lost-property.items.keep-for',
})

export const tables = { items }
```

The same table as a specification would give it:

**`lost_property_items`**: id prefix `xlpi`; realm operational; subject unlinked, for staff (the claimant is recorded by name only; redact ability `lost-property.item.redact`); retention `lost-property.items.keep-for`; not append-only.

| Column | Type | Constraints | Class | On erasure | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | id | primary key | internal | keep |  |
| `performance_id` | ref `core_performances` | nullable | internal | keep | Null when found outside a performance |
| `description` | text | not null | internal | keep | The item, never the owner |
| `found_where` | text |  | internal | keep |  |
| `state` | text | one of `held`, `returned`, `unclaimed`, `disposed` | internal | keep |  |
| `logged_by` | account, actor | not null | internal | keep | Follows a merge |
| `claimant_name` | text |  | personal | anonymise |  |
| `claimant_phone` | text |  | personal | clear |  |
| `claim_note` | text |  | free text | redact |  |
| `returned_at` | timestamp |  | internal | keep |  |
| `created_at` | timestamp | not null | internal | keep |  |

Note: the claimant has no account and no email here, so no erasure request can reach these columns by itself. That is what `subject: { unlinked: 'staff' }` says: the table holds personal data, and only a member of staff with the redact ability can find a person in it. Such a table must declare a `retention`, because the sweep is what removes the rows in the ordinary course, and it appears on the erasure and download screens as a manual step. `subject: 'none'` would be refused here, because the table has personal columns.

## A route, a service and a unit of work

```ts
// layers/lost-property/server/api/lost-property/items/[id]/return.post.ts
import { defineRoute, unitOfWork } from '#kit'
import { z } from 'zod'
import { markReturned } from '../../../../services'

export default defineRoute({
  ability: 'lost-property.item.return',
  record: event => ['lost-property.item', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ claimantName: z.string().max(120), claimNote: z.string().max(500).optional() }),
}, async (event, { input, record, actor }) => {
  const unit = unitOfWork(event)
  await markReturned(unit, record.id, input)
  unit.audit({ action: 'lost-property.item.return', record })
  unit.announce('lost-property.item.returned', { itemId: record.id })
  return unit.commit()
})
```

`markReturned` adds a conditional update to the unit of work (`... where id = ? and state = 'held'`) with an expectation that one row changes. If another person returned the item a moment earlier, the commit refuses with the standard refusal body and nothing is written: no audit entry, no event.

## Its files

```
layers/lost-property/
  module.ts
  module/settings.ts
  module/abilities.ts
  nuxt.config.ts
  server/api/lost-property/items/index.get.ts
  server/api/lost-property/items/index.post.ts
  server/api/lost-property/items/[id]/return.post.ts
  server/services.ts
  server/db/schema.ts
  server/listeners/performance-cancelled.ts
  server/tasks/flag-unclaimed.ts
  server/contributions/core.record-resolver/item.ts
  app/pages/console/lost-property/index.vue
  app/pages/console/lost-property/[id].vue
  i18n/en-GB.json
  docs/console/lost-property.md
  tests/unit/states.test.ts
  tests/integration/return-twice.test.ts
  tests/e2e/log-and-return.spec.ts
```
