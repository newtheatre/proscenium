// The columns other modules add to a list (R-35): only those the viewer holds the ability for, in
// order, after the list owner's own. A module that is off adds none.
import { z } from 'zod'
import { defineRoute, usePoint } from '#kit'
import { holds, mayOpen } from '../../interface/navigation'

interface Column { id: string, list: string, ability: string | string[], component: string, order: number }

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ list: z.string().max(100) }), // not-policy: a sane length for a list id
}, async (_event, { input, actor }) => {
  const columns: { id: string, labelKey: string, component: string }[] = []
  for (const { module, value } of await usePoint<Column>('core.list-column')) {
    if (value.list !== input.list || !holds(await mayOpen(actor, { ability: value.ability }))) continue
    columns.push({ id: value.id, labelKey: `${module}.list-columns.${value.id.slice(value.id.indexOf('.') + 1)}.label`, component: value.component })
  }
  return { columns }
})
