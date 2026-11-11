import { z } from 'zod'
import { readScannedCode } from '#shared/utils/door'
import { tillScopeForm } from '#shared/utils/till'

const form = tillScopeForm.extend({ scanned: z.string().trim().min(1).max(512) })

// What the camera decoded at the bar (F-122 criterion 1, E-129 criterion 2): a signed booking
// token is verified here, never unpacked in the browser; a paid pass is the door's, not the till's.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, form)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const code = readScannedCode(input.scanned)
  if (!code) throw createError({ statusCode: 422, statusMessage: 'That code is not one of ours' })
  if (code.kind === 'PASS_TOKEN') {
    // A pass still owed is paid for here (D-140 criterion 1, 0261); a paid one is the door's.
    const passId = await verifyPassQrToken(code.value)
    const pass = passId ? await passCurrentState(passId) : undefined
    if (!pass || pass.paid !== 0 || pass.status !== 'ACTIVE') throw createError({ statusCode: 422, statusMessage: 'That is a pass; the door admits it' })
    const booking = await tillBookingOnPass(pass.id, resolved.performanceIds)
    if (!booking) throw createError({ statusCode: 404, statusMessage: 'That pass has no booking tonight. Book their seat on it online first, then scan again.' })
    return { booking }
  }

  const bookings = code.kind === 'REFERENCE'
    ? await findTillBookings(code.value, resolved.performanceIds)
    : await (async () => {
        const reservationId = await verifyQrToken(code.value)
        const booking = reservationId ? await tillBookingById(reservationId, resolved.performanceIds) : undefined
        return booking ? [booking] : []
      })()
  if (bookings.length === 0) throw createError({ statusCode: 404, statusMessage: 'That code does not match a booking' })

  return { booking: bookings[0] }
})
