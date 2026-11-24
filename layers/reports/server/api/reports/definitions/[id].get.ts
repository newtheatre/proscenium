// One ready-made report as the page draws it: its figures (with those the reader cannot see marked),
// the breakdowns they share, the scope and the dates its period rule gives. Nothing is read yet.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { reportView } from '../../../ready-made'
import { dateParam, periodParam, scopeParam, scopeRecord } from '../../../query'

export default defineRoute({
  ability: 'reports.report.view',
  record: scopeRecord,
  rateLimit: 'default',
  input: z.object({ scope: scopeParam.optional(), period: periodParam.optional(), from: dateParam.optional(), to: dateParam.optional() }),
}, async (event, { actor, input }) => reportView(getRouterParam(event, 'id')!, actor, input))
