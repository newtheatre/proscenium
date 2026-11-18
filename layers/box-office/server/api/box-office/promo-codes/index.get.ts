// The promo codes (BO-17), with what a code can be limited to: the productions Box office sells, each
// with its performances and parts of the house, and the ticket types.
import { all, defineRoute } from '#kit'
import { getProduction, listPerformances } from '#modules/core'
import { listPromoCodes } from '../../../promo-codes'

export default defineRoute({
  ability: 'box-office.promo.manage',
  rateLimit: 'default',
}, async () => {
  const bands = await all<{ id: string, production_id: string, name: string }>('SELECT id, production_id, name FROM box_office_bands ORDER BY sort, name')
  const sold = [...new Set(bands.map(b => b.production_id))]
  const productions = (await Promise.all(sold.map(async (productionId) => {
    const production = await getProduction(productionId).catch(() => null)
    if (!production) return null
    const performances = (await listPerformances({ productionId })).filter(p => p.state !== 'cancelled').map(p => ({ id: p.id, startsAt: p.startsAt }))
    return { id: production.id, title: production.title, performances, bands: bands.filter(b => b.production_id === productionId).map(b => ({ id: b.id, name: b.name })) }
  }))).filter(p => p !== null).sort((a, b) => a.title.localeCompare(b.title))
  const types = await all<{ id: string, name: string }>("SELECT id, name FROM box_office_ticket_types WHERE active = 1 AND kind <> 'complimentary' ORDER BY sort, name")
  return { rows: await listPromoCodes(), productions, ticketTypes: types }
})
