import { closePeriodForm, periodLockConstraintRefusal, saysClosedOverlap } from '#shared/utils/period-locks'

// Closes a period. A blocking condition is advisory (I-107 criteria 1, 5); a day already closed
// is refused, so two closes never govern one day (0129).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.write')
  const input = await readValidatedBodyOrThrow(event, closePeriodForm)

  try {
    const { id, applied, overlaps } = await closePeriod(input, resolved.account.id)
    if (!applied) throw createError({ statusCode: 409, statusMessage: saysClosedOverlap(overlaps) })
    return { ok: true, id }
  }
  catch (error) {
    const refusal = periodLockConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }
})
