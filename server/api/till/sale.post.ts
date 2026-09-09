import { londonDayOf } from '#shared/utils/ledger'
import { saleForm } from '#shared/utils/sale'

// The submission boundary (F-104), the atomic commit (F-105), and a tab charge when the basket
// names one (F-108): a mismatch refuses quoting both figures.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, saleForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const committed = await commitSale(input.lines, londonDayOf(new Date()), input.expectedTotalPence, input.tabHolderId, {
    actorId: resolved.account.id,
    sessionId: session.id,
    venueId: resolved.venueId,
    night: resolved.night,
  })

  return { ok: true, ...committed }
})
