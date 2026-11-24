// One report as the page draws it, ready-made or saved: its columns (with those the reader cannot see
// marked), the breakdowns they share, the scope and the dates its period rule gives. Nothing is read yet.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { viewOf } from '../../../../runs'
import { dateParam, periodParam, scopeParam, scopeRecord } from '../../../../query'

export default defineRoute({
  ability: 'reports.report.view',
  record: scopeRecord,
  rateLimit: 'default',
  input: z.object({ scope: scopeParam.optional(), period: periodParam.optional(), from: dateParam.optional(), to: dateParam.optional() }),
}, async (event, { actor, input }) => viewOf(getRouterParam(event, 'id')!, actor, input))
