// The facts other modules add to a record page's summary strip (R-35): only those the viewer holds the
// ability for, in order, after the record owner's own. A module that is off adds none.
import { z } from 'zod'
import { defineRoute, usePoint } from '#kit'
import { holds, mayOpen } from '../../interface/navigation'

interface Fact { id: string, record: string, ability: string | string[], component: string, order: number }

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ record: z.string().max(100) }), // not-policy: a sane length for a record type
}, async (_event, { input, actor }) => {
  const facts: { id: string, component: string }[] = []
  for (const { value } of await usePoint<Fact>('core.record-fact')) {
    if (value.record === input.record && holds(await mayOpen(actor, { ability: value.ability }))) facts.push({ id: value.id, component: value.component })
  }
  return { facts }
})
