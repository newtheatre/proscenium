// The current join code, on demand: never emailed, never notified, read only by the duty
// manager who then reads it aloud (E-120 criteria 2, 5).
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const secret = backstageBoardSecret()
  return await currentCode(secret, resolved.venueId, resolved.night)
})
