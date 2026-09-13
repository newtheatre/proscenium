import { z } from 'zod'

// Front of house ticking a call from the wings, the mirror of a crew device's own tick;
// idempotent, so a doubled tap never records twice (E-121 criteria 4, 7).
const seenForm = z.object({ messageId: z.string().min(1, 'Say which message you mean') })

export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const input = await readValidatedBodyOrThrow(event, seenForm)

  const night = await ensureNight(resolved.venueId, resolved.night)
  const deviceId = await fohDevice(backstageBoardSecret(), night)

  await db.run(acknowledgeStatement(input.messageId, deviceId, newId()))

  return { ok: true }
})
