// Takes a past export's range again without recording it, and says whether the file would be the same (E-09).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { checkRun } from '../../../../../build'
import { requireLedgerView } from '../../../../../ledger-view'

export default defineRoute({ ability: 'invoicing.export.take', rateLimit: 'export' }, async (event, { actor }) => {
  await requireLedgerView(actor)
  return await checkRun(getRouterParam(event, 'id')!)
})
