import { saleRefusal } from '#shared/utils/programme'
import { RESERVATION_EMAIL_LIMIT, RESERVATION_EMAIL_WINDOW_MINUTES, RESERVATION_IP_LIMIT, RESERVATION_IP_WINDOW_MINUTES, holdExpiresAt } from '#shared/utils/reservations'
import { PASS_ALREADY_ON_ADDRESS_SAYS, choosePassForm } from '#shared/utils/passes'

// D-139 (0261): a pass chosen while booking, signed in or not. It is a hold, not a sale: the pass
// and its first seat are paid for at the till the first night (0005), and both lapse if never.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, choosePassForm)
  await enforce(event, { scope: 'reservation:ip', value: clientIp(event), limit: RESERVATION_IP_LIMIT, windowMinutes: RESERVATION_IP_WINDOW_MINUTES })

  const account = await currentAccount(event)
  if (!account && !input.guest) {
    throw createError({ statusCode: 400, statusMessage: 'A name and an email address are required to choose a pass without signing in' })
  }
  const email = account?.email ?? input.guest!.email
  await enforce(event, { scope: 'reservation:email', value: email, limit: RESERVATION_EMAIL_LIMIT, windowMinutes: RESERVATION_EMAIL_WINDOW_MINUTES })

  const performance = await performanceById(input.performanceId)
  if (!performance) throw noSuch('performance')
  const releaseMinutes = await holdReleaseMinutesFor(event, performance)
  const refusal = saleRefusal(performance, new Date(), 'CUSTOMER', releaseMinutes)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal.says })

  // Only a pass the booking page itself offers, read live: on sale, covering the show, under its cap.
  const now = Math.floor(Date.now() / 1000)
  const price = await passTypePriceById(input.passTypePriceId)
  const offer = price ? (await passOffers(performance.showId, account?.id ?? null, now)).find(one => one.id === price.passTypeId) : undefined
  if (!price || !offer) throw createError({ statusCode: 409, statusMessage: 'That pass is not on offer for this show any more. Nothing has been booked.' })

  const userId = account?.id ?? await guestPassHolder(input.guest!)
  const result = await choosePass({
    passTypeId: price.passTypeId,
    passTypePriceId: price.id,
    pricePence: price.price,
    redemption: {
      userId,
      performanceId: performance.id,
      showId: performance.showId,
      capacity: effectiveCapacity(performance),
      source: 'WEB',
      admittedBy: null,
      actorId: account?.id ?? null,
      holdExpiresAt: holdExpiresAt(performance.startsAt, releaseMinutes),
    },
  })

  if (!result.applied) {
    if (await activePassOfType(userId, price.passTypeId)) throw createError({ statusCode: 409, statusMessage: PASS_ALREADY_ON_ADDRESS_SAYS })
    const capacityFailure = await currentCapacityRefusal(performance.id, effectiveCapacity(performance), 1)
    throw createError({ statusCode: 409, statusMessage: capacityFailure?.says ?? 'This performance no longer has room for that booking' })
  }

  await rememberPassQrToken(event, await passQrTokenFor(result.passId!))
  const qrToken = await qrTokenFor(result.reservationId!)
  rememberQrToken(event, qrToken)

  const pass = await passCurrentState(result.passId!)
  if (pass) await sendPassIssued(event, { userId, reference: pass.reference, passTypeName: pass.passTypeName, priceLabel: pass.priceLabel }, result.passId!)
  await sendReservationConfirmation(event, {
    userId,
    reference: result.reference!,
    showTitle: performance.showTitle,
    startsAt: performance.startsAt,
    totalPence: 0,
    qrToken,
  })

  return { reference: result.reference, performanceId: performance.id, totalPence: 0, passTotalPence: price.price, qrToken }
})
