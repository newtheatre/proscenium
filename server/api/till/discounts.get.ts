import { tillScopeForm } from '#shared/utils/till'

// What the till may apply right now: active discounts only (F-117).
export default defineEventHandler(async (event) => {
  const scope = await getValidatedQueryOrThrow(event, tillScopeForm)
  await requireNightAuthority(event, 'BAR', scope)

  return { discounts: await activeDiscounts() }
})
