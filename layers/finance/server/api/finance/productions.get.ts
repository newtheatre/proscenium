// The productions with money in the ledger, each with its income and deferred income, for the list
// that leads to each production's statement.
import { defineRoute } from '#kit'
import { getProduction } from '#modules/core'
import { productionsInLedger } from '../../reports'

export default defineRoute({ ability: 'finance.ledger.view', rateLimit: 'default' }, async () => {
  const rows = await productionsInLedger()
  const titles = new Map<string, string>()
  for (const id of new Set(rows.map(r => r.productionId))) {
    // A production deleted since leaves its money in the ledger; it is listed by its id.
    titles.set(id, await getProduction(id).then(p => p.title, () => id))
  }
  return { productions: rows.map(r => ({ ...r, title: titles.get(r.productionId)! })) }
})
