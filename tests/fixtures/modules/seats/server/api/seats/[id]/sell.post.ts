// Sells seats: the last-seat race, idempotency and the settings limit, through a real route.
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { getRouterParam } from 'h3'
import { defineRoute, newId, refuse, useSetting } from '#kit'

export default defineRoute({
  ability: 'seats.orders.sell',
  record: event => ['seats.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ quantity: z.number().int().min(1) }),
}, async (_event, { input, record, actor, unit }) => {
  const max = await useSetting('seats.orders.max-seats')
  if (input.quantity > max) refuse('seats.too-many', `At most ${max} seats in one order.`, { status: 422, fields: { quantity: 'seats.too-many' } })
  unit.add(sql`UPDATE seats_performances SET sold = sold + ${input.quantity} WHERE id = ${record!.id} AND sold + ${input.quantity} <= capacity`)
    .expect(1, { code: 'seats.sold-out', reason: 'There are not enough seats left.' })
  const ledgerId = newId('sl')
  unit.add(sql`INSERT INTO seats_ledger (id, performance_id, quantity, buyer_id, buyer_name, created_at) VALUES (${ledgerId}, ${record!.id}, ${input.quantity}, ${actor.accountId ?? 'acc_test'}, ${actor.name ?? null}, ${Date.now()})`)
  unit.announce('seats.performance.sold', { performanceId: record!.id, quantity: input.quantity }, { record: { type: 'seats.performance', id: record!.id } })
  return { ledgerId }
})
