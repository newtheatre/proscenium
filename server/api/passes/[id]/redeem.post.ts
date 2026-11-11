import { redeemPassForm } from '#shared/utils/passes'

// Self-serve pass redemption while reserving (D-125). Only the pass's own holder may spend it:
// signed in as its record, or in the browser that opened its link (D-138 criterion 3).
export default defineEventHandler(async (event) => {
  const account = await currentAccount(event)
  const input = await readValidatedBodyOrThrow(event, redeemPassForm)
  const passId = getRouterParam(event, 'id') ?? ''

  const performance = await performanceById(input.performanceId)
  if (!performance) throw noSuch('performance')

  const state = await passRedemptionState(passId, performance.showId)
  // Enumeration-safe: a pass that is not the caller's own answers exactly as one that does not
  // exist, the same shape a pass type's own 404 already takes.
  const holds = state && (state.userId === account?.id || (await rememberedPasses(event)).some(one => one.passId === passId))
  if (!state || !holds) throw noSuch('pass')

  const now = Math.floor(Date.now() / 1000)
  const refusal = refusalFor(state, now)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const capacity = effectiveCapacity(performance)
  const result = await redeemPass({
    passId,
    userId: state.userId,
    performanceId: input.performanceId,
    showId: performance.showId,
    capacity,
    source: 'WEB',
    admittedBy: null,
    actorId: account?.id ?? null,
  })

  if (!result.applied) {
    // Read fresh, after the write already decided (criterion 2): this is only what the response
    // says, never a second chance to change the answer.
    const existing = await existingAdmissionFor(passId, input.performanceId)
    if (existing) {
      const when = formatLondon(new Date(existing.admittedAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
      throw createError({ statusCode: 409, statusMessage: `This pass was already redeemed for this performance, at ${when}` })
    }
    // D-113 does not exist yet (docs/known-issues.md): there is no list to join, only the
    // honest count of what is left, the same wording an ordinary reservation refuses with.
    const capacityFailure = await currentCapacityRefusal(input.performanceId, capacity, 1)
    throw createError({ statusCode: 409, statusMessage: capacityFailure?.says ?? 'This performance no longer has room for that admission' })
  }

  const qrToken = await qrTokenFor(result.reservationId!)
  rememberQrToken(event, qrToken)

  await sendReservationConfirmation(event, {
    userId: state.userId,
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
