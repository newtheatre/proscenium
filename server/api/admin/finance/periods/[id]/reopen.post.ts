import { reopenPeriodForm } from '#shared/utils/period-locks'

// Requires an administrator and the range typed back, the same shape a merge's own confirmation
// uses: what is being reopened is exactly what the screen showed, not a stale read (I-107 criterion 4).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.reopen')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, reopenPeriodForm)

  const lock = await periodLockById(id)
  if (!lock) throw noSuch('period lock')
  if (lock.fromDay !== input.confirmFromDay || lock.toDay !== input.confirmToDay) {
    throw createError({ statusCode: 409, statusMessage: 'The typed range does not match this lock: check what you are reopening and try again' })
  }

  const result = await reopenPeriod(id, resolved.account.id)
  if (!result) throw createError({ statusCode: 409, statusMessage: 'This period is not currently closed' })
  if (!result.applied) throw createError({ statusCode: 500, statusMessage: 'That did not save. Try again, and tell the IT Manager if it keeps happening.' })
  return { ok: true, id: result.id }
})
