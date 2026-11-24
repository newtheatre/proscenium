// A copy's CSV, audited as an export (REP-09).
import { getRouterParam, setResponseHeader } from 'h3'
import { defineRoute } from '#kit'
import { runCsv } from '../../../../runs'

export default defineRoute({ ability: 'reports.run.export', rateLimit: 'export' }, async (event, { actor, unit }) => {
  const { name, bytes } = await runCsv(unit.view(), actor, getRouterParam(event, 'id')!)
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${name}"`)
  return bytes
})
