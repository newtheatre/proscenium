// The promo codes (BO-17), with what a code can be limited to: the productions Box office sells and the ticket types.
import { all, defineRoute } from '#kit'
import { getProduction } from '#modules/core'
import { listPromoCodes } from '../../../promo-codes'

export default defineRoute({
  ability: 'box-office.promo.manage',
  rateLimit: 'default',
}, async () => {
  const sold = await all<{ production_id: string }>('SELECT DISTINCT production_id FROM box_office_bands')
  const productions = (await Promise.all(sold.map(async (r) => {
    const production = await getProduction(r.production_id).catch(() => null)
    return production ? { id: production.id, title: production.title } : null
  }))).filter(p => p !== null).sort((a, b) => a.title.localeCompare(b.title))
  const types = await all<{ id: string, name: string }>("SELECT id, name FROM box_office_ticket_types WHERE active = 1 AND kind <> 'complimentary' ORDER BY sort, name")
  return { rows: await listPromoCodes(), productions, ticketTypes: types }
})
