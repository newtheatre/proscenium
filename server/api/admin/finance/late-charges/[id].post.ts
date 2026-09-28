import { LATE_CHARGE_PERMISSION, recordLateChargeForm } from '#shared/utils/sumup'

// "Payment went through" on a charge whose night's till is closed: the Treasurer's to record, as a
// sale on that night, against the total the screen showed (question 15, F-124 criterion 9, 0005).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, LATE_CHARGE_PERMISSION)
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, recordLateChargeForm)

  const row = await attemptById(id)
  if (!row) throw noSuch('card charge')

  const outcome = await recordLateCharge(row, input.expectedTotalPence, resolved.account.id, {
    baseURL: useRuntimeConfig(event).public.baseURL,
    event,
  })
  return { ok: true, id, ...outcome }
})
