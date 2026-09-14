import { z } from 'zod'
import { readDeskScan } from '#shared/utils/desk'

const body = z.object({ scanned: z.string().trim().min(1).max(2000) })

// Whatever the camera or a keyboard-wedge scanner produced (criterion 8): a signed token is
// verified here and never unpacked in the browser; a reference is looked up as typed.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await readValidatedBodyOrThrow(event, body)

  const code = readDeskScan(input.scanned)
  if (code.kind === 'REFUSED') throw createError({ statusCode: 422, statusMessage: code.reason })

  if (code.kind === 'REFERENCE') {
    const reservation = await deskReservationByReference(code.value)
    if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })
    return reservation
  }

  const reservationId = await verifyQrToken(code.value)
  if (!reservationId) throw createError({ statusCode: 404, statusMessage: 'That code is not recognised' })

  const reservation = await deskReservation(reservationId)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  return reservation
})
