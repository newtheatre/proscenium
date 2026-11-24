// Cancels a price change set for later (BO-03): what was in force before it carries on. The table
// is append-only, so this adds a row at the same moment that repeats the earlier price.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, idSchema, refuse, useSetting } from '#kit'
import { getProduction } from '#modules/core'
import { cancelScheduledPrice } from '../../../../../prices'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    bandId: idSchema('band'),
    ticketTypeId: idSchema('tty'),
    performanceId: idSchema('perf').nullable(),
    from: z.number().int().positive(),
  }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  await getProduction(record!.id)
  const done = await cancelScheduledPrice(unit.view(), record!.id, await useSetting('core.locale.currency') as string, input, actor.accountId ?? null)
  if (!done) refuse('box-office.price.nothing-scheduled', 'There is no price change set for then.', { status: 409, remedy: 'Reload to see what is set.' })
  unit.audit({ action: 'update', record: ['core.production', record!.id], detail: { cancelledFrom: input.from } })
  return { cancelled: true }
})
