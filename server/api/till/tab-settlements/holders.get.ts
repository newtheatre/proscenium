import { tillScopeForm } from '#shared/utils/till'

// Who owes the bar anything, for the till's Settle a tab picker: every holder with an outstanding
// charge, authorised now or not, since a holder struck off still owes (F-109, 0162).
export default defineEventHandler(async (event) => {
  const scope = await getValidatedQueryOrThrow(event, tillScopeForm)
  await requireNightAuthority(event, 'BAR', { venueId: scope.venueId, performanceId: scope.performanceId })
  return { ok: true, holders: await unsettledTabsSummary() }
})
