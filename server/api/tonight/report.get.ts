import { z } from 'zod'

// The live draft, recomputed on every view (E-123 criterion 4). A venue running more than one
// performance today must name which one (E-127 criterion 1).
const query = z.object({ performanceId: z.string().min(1).optional() })

export default defineEventHandler(async (event) => {
  const { performanceId } = await getValidatedQueryOrThrow(event, query)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', performanceId ? { performanceId } : {})

  const target = performanceId ?? resolved.performanceIds[0]
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight, so there is no report to compile' })
  if (!performanceId && resolved.performanceIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one performance is running tonight: name the performance' })
  }

  return await compileNightReport(target, resolved.venueId, resolved.night)
})
