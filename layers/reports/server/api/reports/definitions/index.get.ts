// The ready-made reports the reader may open, grouped by area on the page (K1).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { readyMadeFor } from '../../../ready-made'

export default defineRoute({ ability: 'reports.report.view', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  const reports = (await readyMadeFor(actor)).map(({ report, module }) => ({ id: report.id, label: report.label, description: report.description, area: report.area, scope: report.scope, module }))
  return { reports }
})
