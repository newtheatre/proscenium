// Takes an export (IE-04 to IE-06): the file, and a run recorded with its fingerprint (E-09), the audited
// record of this read. Whether an earlier run of the same range gave the same bytes comes back in a header.
import { setResponseHeader } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { takeExport } from '../../../build'
import { requireLedgerView } from '../../../ledger-view'

export default defineRoute({
  ability: 'invoicing.export.take',
  rateLimit: 'export',
  input: z.object({ profileId: z.string().min(1).max(40), from: z.iso.date(), to: z.iso.date() }), // not-policy: an id's length
}, async (event, { input, actor, unit }) => {
  await requireLedgerView(actor)
  const { csv, run, sameAs } = await takeExport(unit, { ...input, by: actor.accountId ?? null })
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="export-${input.from}-to-${input.to}${run.closed ? '' : '-open'}.csv"`)
  setResponseHeader(event, 'x-export-run', run.id)
  if (sameAs) setResponseHeader(event, 'x-export-same-as', String(sameAs.createdAt))
  return csv
})
