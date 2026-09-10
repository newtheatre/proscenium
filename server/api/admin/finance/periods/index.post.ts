import { closePeriodForm, periodLockConstraintRefusal } from '#shared/utils/period-locks'

// Closes a period; the treasurer's own write, warned by preview.post.ts first but not re-checked
// here, since a blocking condition is advisory rather than a refusal (I-107 criteria 1, 5).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.write')
  const input = await readValidatedBodyOrThrow(event, closePeriodForm)

  try {
    const { id, applied } = await closePeriod(input, resolved.account.id)
    if (!applied) throw createError({ statusCode: 500, statusMessage: 'The close was not recorded' })
    return { ok: true, id }
  }
  catch (error) {
    const refusal = periodLockConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }
})
