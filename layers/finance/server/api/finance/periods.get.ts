// Every period, open or closed, with its sealed totals.
import { defineRoute } from '#kit'
import { listPeriods } from '../../periods'
import { periodTotals } from '../../close'

export default defineRoute({ ability: 'finance.ledger.view', rateLimit: 'default' }, async () => {
  const periods = await listPeriods()
  return { periods: await Promise.all(periods.map(async p => ({ ...p, ...(await periodTotals(p.id)) }))) }
})
