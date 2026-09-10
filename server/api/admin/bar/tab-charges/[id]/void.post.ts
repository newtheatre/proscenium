import { voidTabChargeForm } from '#shared/utils/tab-settlement'

// Void an unsettled tab charge, with a mandatory reason: the bar manager's own call, never the
// till's (F-109 criterion 4).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which charge' })
  const input = await readValidatedBodyOrThrow(event, voidTabChargeForm)

  const voided = await voidTabCharge(id, input.reason, resolved.account.id)
  return { ok: true, ...voided }
})
