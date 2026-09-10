import { checklistScopeForm } from '#shared/utils/checklist'

// This performance's checklist, stamped from the current configuration the first time it is read
// (E-114 criteria 1, 2, 3). Carries the close, so a reload does not forget it is already closed.
export default defineEventHandler(async (event) => {
  const { performanceId } = await getValidatedQueryOrThrow(event, checklistScopeForm)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', performanceId ? { performanceId } : {})

  const target = performanceId ?? resolved.performanceIds[0]
  if (!target) throw createError({ statusCode: 403, statusMessage: 'Nothing is running tonight, so there is no checklist' })
  if (!performanceId && resolved.performanceIds.length > 1) {
    throw createError({ statusCode: 400, statusMessage: 'More than one performance is running tonight: name the performance' })
  }

  const [items, close] = await Promise.all([
    checklistFor(target),
    closeFor(target),
  ])
  return { performanceId: target, night: resolved.night, venueId: resolved.venueId, items, close }
})
