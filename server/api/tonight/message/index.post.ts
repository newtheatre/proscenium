import { nightMessageForm } from '#shared/utils/night-message'

// Tonight's duty manager messages one of tonight's performances, at once (0101). The shift window
// and an officer's recorded bypass are the guard's own (0078, 0044, 0098).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, nightMessageForm)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', { performanceId: input.performanceId })

  return sendNightMessage(event, resolved.account.id, resolved.via, input, resolved.night)
})
