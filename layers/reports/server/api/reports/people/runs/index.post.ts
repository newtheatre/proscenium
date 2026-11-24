// Keep a copy of a people report (REP-44): read now, as the person asking, and kept as rows of
// account ids and numbers until reports.people.keep-for passes (P5). keepPeople checks reports.people.view.
import { defineRoute } from '#kit'
import { keepPeople } from '../../../../people'
import { copyAsk } from '../../../../query'

export default defineRoute({
  ability: 'reports.report.view',
  rateLimit: 'export',
  input: copyAsk,
}, async (_event, { actor, input, unit }) => {
  const { report, ...query } = input
  return await keepPeople(unit.view(), actor, report, query)
})
