import { passRedemptionRefusal, redeemPassForm } from '#shared/utils/passes'

// Self-serve pass redemption while reserving (D-125). Only the pass's own holder may spend it.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, redeemPassForm)
  const passId = getRouterParam(event, 'id') ?? ''

  const performance = await performanceById(input.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const state = await passRedemptionState(passId, performance.showId)
  // Enumeration-safe: a pass that is not the caller's own answers exactly as one that does not
  // exist, the same shape a pass type's own 404 already takes.
  if (!state || state.userId !== account.id) throw createError({ statusCode: 404, statusMessage: 'No such pass' })

  const now = Math.floor(Date.now() / 1000)
  const refusal = passRedemptionRefusal(
    { status: state.status, passTypeStatus: state.passTypeStatus, validFrom: state.validFrom, validUntil: state.validUntil, coversShow: state.coversShow === 1 },
    now,
  )
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const capacity = effectiveCapacity(performance)
  const result = await redeemPass({
    passId,
    userId: account.id,
    performanceId: input.performanceId,
    showId: performance.showId,
    capacity,
    source: 'WEB',
    admittedBy: null,
    actorId: account.id,
  })

  if (!result.applied) {
    // Read fresh, after the write already decided (criterion 2): this is only what the response
    // says, never a second chance to change the answer.
    if (await alreadyAdmittedForPerformance(passId, input.performanceId)) {
      throw createError({ statusCode: 409, statusMessage: 'This pass has already been redeemed for this performance' })
    }
    // D-113 does not exist yet (docs/known-issues.md): there is no list to join, only the
    // honest count of what is left, the same wording an ordinary reservation refuses with.
    const capacityFailure = await currentCapacityRefusal(input.performanceId, capacity, 1)
    throw createError({ statusCode: 409, statusMessage: capacityFailure?.says ?? 'This performance no longer has room for that admission' })
  }

  const qrToken = await qrTokenFor(result.reservationId!)

  await sendReservationConfirmation(event, {
    userId: account.id,
    reference: result.reference!,
    showTitle: performance.showTitle,
    startsAt: performance.startsAt,
    totalPence: 0,
    qrToken,
  })

  return {
    reference: result.reference,
    performanceId: input.performanceId,
    totalPence: 0,
    qrToken,
  }
})
