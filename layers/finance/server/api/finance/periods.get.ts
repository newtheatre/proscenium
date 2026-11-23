// Every period, open or closed, with its sealed totals.
import { can, defineRoute } from '#kit'
import { listPeriods } from '../../periods'
import { periodTotals } from '../../close'

export default defineRoute({ ability: 'finance.ledger.view', rateLimit: 'default' }, async (_event, { actor }) => {
  const periods = await listPeriods()
  return {
    periods: await Promise.all(periods.map(async p => ({ ...p, ...(await periodTotals(p.id)) }))),
    // Whether the viewer may take the ledger away as a file, so the Ledger offers Export only then.
    canExport: (await can(actor, 'finance.ledger.export')).allowed,
  }
})
