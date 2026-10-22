import { settleTabForm } from '#shared/utils/tab-settlement'

// Settle a tab on the reader: exactly the charges the screen named, cross-checked now and held on
// a typed card charge, so nothing is recorded until the reader has answered (F-109, 0096, 0162).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, settleTabForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  await checkSettlement(input.holderId, input.entryIds, input.expectedTotalPence)
  // Nothing for the reader to take, so nothing to wait for: written at once, as a sale of nought is.
  if (input.expectedTotalPence === 0) {
    const settled = await settleTab(input.holderId, input.entryIds, 0, { actorId: resolved.account.id, sessionId: session.id })
    return { ok: true, id: null, kind: null, totalPence: 0, ...settled }
  }
  const id = await startSettlementAttempt({
    kind: 'TYPED',
    basket: {
      settlement: { holderId: input.holderId, entryIds: input.entryIds },
      sessionId: session.id,
      venueId: resolved.venueId,
      night: resolved.night,
      performanceId: null,
      performanceIds: resolved.performanceIds,
    },
    expectedTotalPence: input.expectedTotalPence,
    actorId: resolved.account.id,
  }, input.holderId)
  return { ok: true, id, kind: 'TYPED' as const, totalPence: input.expectedTotalPence }
})
