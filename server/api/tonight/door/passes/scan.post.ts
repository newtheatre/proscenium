import { doorPassScanForm, passRedemptionRefusal } from '#shared/utils/passes'

// Scan a pass at the door (D-126). Admits in one gesture if it is already redeemed for tonight;
// offers to redeem it on the spot, capacity-checked, if it is not (criterion 1).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, doorPassScanForm)
  const resolved = await requireNightAuthority(event, 'DOOR', { performanceId: input.performanceId })

  const performance = await performanceById(input.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const state = await passRedemptionStateByReference(input.reference, performance.showId)
  if (!state) throw createError({ statusCode: 404, statusMessage: 'No such pass' })

  const existing = await admissionForPerformance(state.id, input.performanceId)
  if (existing) {
    // Once-per-performance already spent the seat; the door's only job left is the physical
    // admission, or refusing a second one (criterion 2, criterion 4).
    if (existing.reservationStatus === 'DOOR') {
      throw createError({ statusCode: 409, statusMessage: 'This pass has already been admitted tonight' })
    }
    if (existing.reservationStatus !== 'PENDING' && existing.reservationStatus !== 'COLLECTED') {
      throw createError({ statusCode: 409, statusMessage: 'This pass\'s admission for tonight was cancelled' })
    }
    const admitted = await admitAtDoor(existing.reservationId, resolved.account.id)
    if (!admitted) throw createError({ statusCode: 409, statusMessage: 'This pass has already been admitted tonight' })
    return { decision: 'ADMIT' as const, passTypeName: state.passTypeName }
  }

  const now = Math.floor(Date.now() / 1000)
  const refusal = passRedemptionRefusal(
    { status: state.status, passTypeStatus: state.passTypeStatus, validFrom: state.validFrom, validUntil: state.validUntil, coversShow: state.coversShow === 1 },
    now,
  )
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const capacity = effectiveCapacity(performance)
  const result = await redeemPass({
    passId: state.id,
    userId: state.userId,
    performanceId: input.performanceId,
    showId: performance.showId,
    capacity,
    source: 'DOOR',
    admittedBy: resolved.account.id,
    actorId: resolved.account.id,
    admitImmediately: true,
  })

  if (!result.applied) {
    if (await alreadyAdmittedForPerformance(state.id, input.performanceId)) {
      throw createError({ statusCode: 409, statusMessage: 'This pass has already been admitted tonight' })
    }
    const capacityFailure = await currentCapacityRefusal(input.performanceId, capacity, 1)
    throw createError({ statusCode: 409, statusMessage: capacityFailure?.says ?? 'This performance no longer has room for that admission' })
  }

  return { decision: 'ADMIT' as const, passTypeName: state.passTypeName }
})
