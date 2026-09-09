import { settleTabForm } from '#shared/utils/tab-settlement'

// Settle a tab on the reader: exactly the charges the screen named, cross-checked against what
// they actually total right now (F-109 criteria 2, 3).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, settleTabForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const settled = await settleTab(input.holderId, input.entryIds, input.expectedTotalPence, {
    actorId: resolved.account.id,
    sessionId: session.id,
  })

  return { ok: true, ...settled }
})
