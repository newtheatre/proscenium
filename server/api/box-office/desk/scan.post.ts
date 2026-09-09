import { z } from 'zod'

const body = z.object({ scanned: z.string().trim().min(1).max(2000) })

// A USB or Bluetooth scanner types the QR's payload like a keyboard: the full URL it opens, or
// the bare token, either way ending in `/qr/<token>` or nothing else at all (criterion 1).
function tokenFrom(scanned: string): string {
  const at = scanned.lastIndexOf('/qr/')
  return at === -1 ? scanned : scanned.slice(at + 4)
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await readValidatedBodyOrThrow(event, body)

  const reservationId = await verifyQrToken(tokenFrom(input.scanned))
  if (!reservationId) throw createError({ statusCode: 404, statusMessage: 'That code is not recognised' })

  const reservation = await deskReservation(reservationId)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  return reservation
})
