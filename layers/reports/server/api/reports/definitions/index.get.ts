// The reports the reader may open: ready-made ones grouped by area on the page (K1), then saved ones,
// their own, those shared with a role they hold, and every one for a manager (D4).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { readyMadeFor } from '../../../ready-made'
import { savedFor } from '../../../definitions'

export default defineRoute({ ability: 'reports.report.view', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  const reports = (await readyMadeFor(actor)).map(({ report, module }) => ({ id: report.id, label: report.label, description: report.description, area: report.area, scope: report.scope, module }))
  return { reports, saved: await savedFor(actor) }
})
