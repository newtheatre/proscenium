// Sets prices from now on, or from a later moment such as the end of an early-bird offer (BO-03):
// each is a new row, so baskets and orders already written keep the price they were given and the
// history shows who changed it and when.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { all, defineRoute, idSchema, nowMs, refuse, useSetting } from '#kit'
import { getPerformance, getProduction } from '#modules/core'
import { setPrices } from '../../../../prices'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    prices: z.array(z.object({
      bandId: idSchema('band'),
      ticketTypeId: idSchema('tty'),
      performanceId: idSchema('perf').nullish(),
      // Nothing withdraws the price.
      amountMinor: z.number().int().min(0).nullable(),
      // With a performance: follow the production's price again.
      inherit: z.boolean().optional(),
    }).strict()).min(1).max(200), // not-policy: a price grid's bound, bands by ticket types
    // When they take effect, in milliseconds; now when absent.
    from: z.number().int().positive().optional(),
  }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  await getProduction(record!.id)
  const bands = new Set((await all<{ id: string }>('SELECT id FROM box_office_bands WHERE production_id = ?', record!.id)).map(b => b.id))
  if (input.prices.some(p => !bands.has(p.bandId))) refuse('box-office.band.not-found', 'One of these bands does not belong to this production.', { status: 422 })
  // Complimentary tickets are given through an approved request, never priced, so none can be bought.
  const comps = new Set((await all<{ id: string }>("SELECT id FROM box_office_ticket_types WHERE kind = 'complimentary'")).map(t => t.id))
  if (input.prices.some(p => comps.has(p.ticketTypeId) && p.amountMinor !== null))
    refuse('box-office.price.complimentary', 'Complimentary tickets are not priced: they are issued by approving a request for them.', { status: 422, remedy: 'Leave the Complimentary column out.' })
  if (input.prices.some(p => p.inherit && !p.performanceId)) refuse('box-office.price.inherit-needs-performance', 'Only one performance\'s own price can go back to the production\'s.', { status: 422 })
  if (input.from !== undefined && input.from <= nowMs())
    refuse('box-office.price.from-past', 'A price change set for later has to start in the future.', { status: 422, fields: { from: 'invalid' }, remedy: 'Choose a later date, or set the price now.' })
  const performanceIds = [...new Set(input.prices.map(p => p.performanceId).filter((x): x is string => !!x))]
  for (const performanceId of performanceIds) {
    if ((await getPerformance(performanceId)).productionId !== record!.id) refuse('box-office.performance.not-found', 'One of these performances is not of this production.', { status: 422 })
  }
  const priceIds = setPrices(unit.view(), record!.id, await useSetting('core.locale.currency') as string, input.prices, actor.accountId ?? null, input.from)
  unit.audit({ action: 'update', record: ['core.production', record!.id], detail: { prices: priceIds.length, ...(input.from ? { from: input.from } : {}) } })
  return { priceIds }
})
