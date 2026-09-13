import { z } from 'zod'

const query = z.object({ performanceId: z.string().trim().min(1, 'Say which performance you mean') })

// The five KPI tiles and the "Tonight" card in one read (D-114, D-132), scoped to the
// performance on screen: a house's own numbers, not the whole night's.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { performanceId } = await getValidatedQueryOrThrow(event, query)

  const summary = await deskSummary(event, performanceId)
  if (!summary) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
  return summary
})
