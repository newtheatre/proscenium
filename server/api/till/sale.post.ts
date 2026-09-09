import { londonDayOf } from '#shared/utils/ledger'
import { saleForm } from '#shared/utils/sale'

// The submission boundary (F-104) and the atomic commit (F-105): a Challenge 25 outcome (F-106),
// a discount (F-117) and a tab charge (F-108) batch together; a mismatch refuses quoting both figures.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, saleForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const committed = await commitSale(
    input.lines, londonDayOf(new Date()), input.expectedTotalPence, input.ageCheck, input.discountId, input.tabHolderId,
    {
      actorId: resolved.account.id,
      sessionId: session.id,
      venueId: resolved.venueId,
      night: resolved.night,
      // A basket sells for the whole night, not one performance; naming one is only honest when the
      // till's own authority resolved to exactly one (E-118 criterion 4's nullable performance_id).
      performanceId: resolved.performanceIds.length === 1 ? resolved.performanceIds[0]! : null,
    },
  )

  return { ok: true, ...committed }
})
