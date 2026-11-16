// A record's readiness checklist (R-35): every check other modules and the owner contribute for this
// record type, for the person asking, answered for one record. A check that fails is left out rather
// than breaking the page.
import { z } from 'zod'
import { defineRoute, usePoint } from '#kit'
import { holds, mayOpen } from '../../interface/navigation'
import type { RecordCheck } from '../../points/record-check'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ record: z.string().max(100), id: z.string().max(100) }), // not-policy: a sane length for ids
}, async (_event, { input, actor }) => {
  const lines: { id: string, order: number, done: boolean, sentence: string, link?: string }[] = []
  for (const { id, value } of await usePoint<RecordCheck>('core.record-check')) {
    if (value.record !== input.record || !holds(await mayOpen(actor, { ability: value.ability }))) continue
    try {
      const answer = await value.check(input.id)
      lines.push({ id, order: value.order, ...answer })
    }
    catch { /* a check that cannot answer is left out */ }
  }
  return { checks: lines.sort((a, b) => a.order - b.order).map(({ order: _order, ...line }) => line) }
})
