// A people report read live (REP-35): one row per person, read through readPersonMeasure, which
// checks both abilities and audits each read (P1, P2). Nothing is written by Reports.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { peopleView, readPeople } from '../../../people'
import { dateParam, keyParam, periodParam, scopeParam } from '../../../query'

export default defineRoute({
  ability: 'reports.people.view',
  rateLimit: 'default',
  input: z.object({ report: z.string().max(80), scope: scopeParam.optional(), period: periodParam.optional(), from: dateParam.optional(), to: dateParam.optional(), by: keyParam.optional() }), // not-policy: a report id's length
}, async (_event, { actor, input }) => {
  const { report, by, ...query } = input
  return await readPeople(actor, await peopleView(report, actor, query), by)
})
