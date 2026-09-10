import { z } from 'zod'

// The live draft (E-123 criterion 4) until sign-off freezes it, after which the frozen snapshot
// and its addenda return instead (E-124 criterion 5). A venue running more than one today must name which one.
const query = z.object({ performanceId: z.string().min(1).optional() })

export default defineEventHandler(async (event) => {
  const { performanceId } = await getValidatedQueryOrThrow(event, query)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', performanceId ? { performanceId } : {})

  const target = performanceId ?? resolved.performanceIds[0]
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight, so there is no report to compile' })
  if (!performanceId && resolved.performanceIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one performance is running tonight: name the performance' })
  }

  const signed = await reportForPerformance(target)
  if (signed) {
    return {
      ...signed.report,
      signedOff: {
        closingNote: signed.closingNote,
        signedByName: signed.signedByName,
        signedVia: signed.signedVia,
        signedAt: signed.signedAt,
      },
      addenda: await addendaForReport(signed.id),
    }
  }

  return { ...(await compileNightReport(target, resolved.venueId, resolved.night)), signedOff: null, addenda: [] }
})
