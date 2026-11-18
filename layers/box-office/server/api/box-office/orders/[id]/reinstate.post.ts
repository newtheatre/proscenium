// Seat again someone whose unpaid reservation was released, if seats are still free (Matt,
// 2026-11-18). The same booking is reserved again, to be paid for now. It takes seats, so it needs
// selling for the performance.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, first, requireAbility } from '#kit'
import { reinstateReservation } from '../../../../release'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  const orderId = getRouterParam(event, 'id')!
  const line = await first<{ performance_id: string }>("SELECT performance_id FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' LIMIT 1", orderId)
  await requireAbility(actor, 'box-office.order.sell', ['core.performance', line?.performance_id ?? ''])
  return reinstateReservation(unit.view(), orderId, actor.accountId ?? null)
})
