import { commitCompSaleForm } from '#shared/utils/comps'
import { londonDayOf } from '#shared/utils/ledger'

// Give an approved comp: the basket it named, never one resubmitted here, so an approval can
// never be stretched to cover more than was asked for (F-110 criteria 2, 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which request' })
  const input = await readValidatedBodyOrThrow(event, commitCompSaleForm)

  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const committed = await commitCompSale(id, londonDayOf(new Date()), input.expectedForegonePence, input.ageCheck, {
    actorId: resolved.account.id,
    sessionId: session.id,
    venueId: resolved.venueId,
    night: resolved.night,
    performanceId: resolved.performanceIds.length === 1 ? resolved.performanceIds[0]! : null,
  })

  return { ok: true, ...committed }
})
