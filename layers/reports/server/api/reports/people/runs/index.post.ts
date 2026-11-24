// Keep a copy of a people report (REP-44): read now, as the person asking, and kept as rows of
// account ids and numbers until reports.people.keep-for passes (P5). keepPeople checks reports.people.view.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { keepPeople } from '../../../../people'
import { dateParam, keyParam, periodParam, scopeParam } from '../../../../query'

export default defineRoute({
  ability: 'reports.report.view',
  rateLimit: 'export',
  input: z.object({ report: z.string().max(80), scope: scopeParam.optional(), period: periodParam.optional(), from: dateParam.optional(), to: dateParam.optional(), by: keyParam.optional() }), // not-policy: a report id's length
}, async (_event, { actor, input, unit }) => {
  const { report, ...query } = input
  return await keepPeople(unit.view(), actor, report, query)
})
