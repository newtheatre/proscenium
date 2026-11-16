// The tabs other modules add to a record page (UI-12), for the person asking: only those they hold
// the ability for, in order, after the record owner's own. A module that is off adds none.
import { z } from 'zod'
import { defineRoute, usePoint } from '#kit'
import { holds, mayOpen } from '../../interface/navigation'
import { countOf } from '../../interface/counts'

interface Tab { id: string, record: string, ability: string | string[], component: string, order: number, count?: string }

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ record: z.string().max(100) }), // not-policy: a sane length for a record type
}, async (_event, { input, actor }) => {
  const found: { order: number, tab: { id: string, labelKey: string, component: string, count?: number } }[] = []
  for (const { module, value } of await usePoint<Tab>('core.record-tab')) {
    if (value.record !== input.record || !holds(await mayOpen(actor, { ability: value.ability }))) continue
    const name = value.id.slice(value.id.indexOf('.') + 1)
    found.push({ order: value.order, tab: { id: value.id, labelKey: `${module}.record-tabs.${name}.label`, component: value.component, count: value.count ? await countOf(value.count, actor) : undefined } })
  }
  return { tabs: found.sort((a, b) => a.order - b.order).map(f => f.tab) }
})
