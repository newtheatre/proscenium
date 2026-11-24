// A people copy's CSV (REP-45, P4): made now from its rows and today's names, never stored.
import { getRouterParam, setResponseHeader } from 'h3'
import { defineRoute } from '#kit'
import { peopleCsv } from '../../../../../people'

export default defineRoute({ ability: 'reports.people.export', rateLimit: 'export' }, async (event, { actor, unit }) => {
  const { name, text } = await peopleCsv(unit.view(), actor, getRouterParam(event, 'id')!)
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${name}"`)
  setResponseHeader(event, 'cache-control', 'no-store')
  return text
})
