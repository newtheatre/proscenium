// Sets prices from now on (BO-03): each is a new row, so baskets and orders already written keep
// the price they were given and the history shows who changed it and when.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { all, defineRoute, idSchema, refuse, useSetting } from '#kit'
import { getProduction } from '#modules/core'
import { setPrices } from '../../../../prices'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    prices: z.array(z.object({
      bandId: idSchema('band'),
      ticketTypeId: idSchema('tty'),
      performanceId: idSchema('perf').nullish(),
      // Nothing withdraws the price.
      amountMinor: z.number().int().min(0).nullable(),
    }).strict()).min(1).max(200), // not-policy: a price grid's bound, bands by ticket types
  }).strict(),
}, async (_event, { input, record, actor, unit }) => {
  await getProduction(record!.id)
  const bands = new Set((await all<{ id: string }>('SELECT id FROM box_office_bands WHERE production_id = ?', record!.id)).map(b => b.id))
  if (input.prices.some(p => !bands.has(p.bandId))) refuse('box-office.band.not-found', 'One of these bands does not belong to this production.', { status: 422 })
  // Complimentary tickets are given through an approved request, never priced, so none can be bought.
  const comps = new Set((await all<{ id: string }>("SELECT id FROM box_office_ticket_types WHERE kind = 'complimentary'")).map(t => t.id))
  if (input.prices.some(p => comps.has(p.ticketTypeId) && p.amountMinor !== null))
    refuse('box-office.price.complimentary', 'Complimentary tickets are not priced: they are issued by approving a request for them.', { status: 422, remedy: 'Leave the Complimentary column out.' })
  const priceIds = setPrices(unit.view(), record!.id, await useSetting('core.locale.currency') as string, input.prices, actor.accountId ?? null)
  unit.audit({ action: 'update', record: ['core.production', record!.id], detail: { prices: priceIds.length } })
  return { priceIds }
})
