// Release unpaid no-shows (Matt, 2026-11-18): every reservation for the performance still unpaid,
// and not marked to keep, lets its seats go at once, so the door can sell them to people waiting.
// Each booking keeps its record, so its buyer can be seated again if seats are free.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, requireAbility } from '#kit'
import { releaseReservation, unpaidFor } from '../../../../../release'

export default defineRoute({
  ability: 'signed-in',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { record, actor, unit }) => {
  // Asked first, so someone who may not release learns so even when there is nothing to release.
  await requireAbility(actor, 'box-office.order.release')
  const ids = await unpaidFor(record!.id!)
  for (const id of ids) {
    await requireAbility(actor, 'box-office.order.release', ['box-office.order', id])
    await releaseReservation(unit.view(), id, 'staff')
  }
  return { released: ids }
})
