import { tillScopeForm } from '#shared/utils/till'

// Drop the pass (D-140 criterion 4, 0261): the holder will not pay for it, so it and its held
// bookings are cancelled and tonight's seat can be sold as a walk-up. Only a pass booked tonight here.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, tillScopeForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const passId = getRouterParam(event, 'id') ?? ''
  const booking = await tillBookingOnPass(passId, resolved.performanceIds)
  if (!booking?.unpaidPass) throw noSuch('pass')

  const dropped = await dropUnpaidPass(passId, resolved.account.id)
  if (!dropped) throw createError({ statusCode: 409, statusMessage: PASS_NOT_OWED_SAYS })
  return { ok: true, message: `${booking.unpaidPass.passTypeName} ${booking.unpaidPass.reference} is dropped, and its bookings are cancelled. Nothing was charged.` }
})
