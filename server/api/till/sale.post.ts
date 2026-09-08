import { londonDayOf } from '#shared/utils/ledger'
import { saleForm } from '#shared/utils/sale'

// The submission boundary (F-104) and, once it matches, the atomic commit (F-105): a mismatch
// refuses quoting both figures; a match writes the ledger entry, lines and stock in one batch.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, saleForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.till.sale',
    target: `till-session:${session.id}`,
    detail: { venueId: resolved.venueId, night: resolved.night, lines: input.lines.length },
  })
  const committed = await commitSale(input.lines, londonDayOf(new Date()), resolved.account.id, input.expectedTotalPence, entry)

  return { ok: true, ...committed }
})
