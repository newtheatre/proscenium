import { z } from 'zod'
import { readScannedCode } from '#shared/utils/door'

// What a camera decoded, turned into the reference the door already scans (E-129 criterion 2).
// A signed token is verified here and never unpacked in the browser, so the door holds no key.
const form = z.strictObject({
  scanned: z.string().trim().min(1).max(512),
  performanceId: z.string().trim().min(1),
})

export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, form)
  await requireNightAuthority(event, 'DOOR', { performanceId: input.performanceId })

  const code = readScannedCode(input.scanned)
  if (!code) throw createError({ statusCode: 422, statusMessage: 'That code is not one of ours' })

  if (code.kind === 'REFERENCE') return { reference: code.value }

  if (code.kind === 'BOOKING_TOKEN') {
    const reservationId = await verifyQrToken(code.value)
    const reservation = reservationId ? await reservationCurrentState(reservationId) : undefined
    if (!reservation) throw createError({ statusCode: 404, statusMessage: 'That code does not match a booking' })
    return { reference: reservation.reference }
  }

  const passId = await verifyPassQrToken(code.value)
  const pass = passId ? await passCurrentState(passId) : undefined
  if (!pass) throw createError({ statusCode: 404, statusMessage: 'That code does not match a pass' })
  return { reference: pass.reference }
})
