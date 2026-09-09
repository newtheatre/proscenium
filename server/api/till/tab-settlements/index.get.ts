import { tabHolderScopeForm } from '#shared/utils/tab-settlement'

// What the till's settlement screen offers for one holder: their unsettled, unvoided charges
// (F-109 criteria 2, 3).
export default defineEventHandler(async (event) => {
  const scope = await getValidatedQueryOrThrow(event, tabHolderScopeForm)
  await requireNightAuthority(event, 'BAR', { venueId: scope.venueId, performanceId: scope.performanceId })

  const charges = await outstandingTabCharges(scope.holderId)
  return { ok: true, charges, totalPence: charges.reduce((sum, charge) => sum + charge.totalPence, 0) }
})
