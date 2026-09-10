import { defineTermForm, periodLockConstraintRefusal } from '#shared/utils/period-locks'

// Names a term's own range, separately from closing it: the treasurer defines a term as soon as
// its dates are agreed, and the dashboard's TERM selector reads it whether or not it is ever closed.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.write')
  const input = await readValidatedBodyOrThrow(event, defineTermForm)

  try {
    const { id, applied } = await defineTerm(input, resolved.account.id)
    if (!applied) throw createError({ statusCode: 500, statusMessage: 'The term was not recorded' })
    return { ok: true, id }
  }
  catch (error) {
    const refusal = periodLockConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }
})
