// One figure, read live for a report page (rule R1). Nothing is kept.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { readFigure } from '../../figures'
import { breakdownParam, dateParam, scopeParam, scopeRecord } from '../../query'
import type { FigureAnswer } from '../../../shared/reports'

export default defineRoute({
  ability: 'reports.report.view',
  record: scopeRecord,
  rateLimit: 'default',
  input: z.object({ id: z.string().max(80), from: dateParam, to: dateParam, scope: scopeParam.optional(), by: breakdownParam.optional() }), // not-policy: a figure id's length
}, async (_event, { actor, input }): Promise<FigureAnswer> => readFigure(actor, input))
