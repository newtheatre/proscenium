import { nightMessageForm } from '#shared/utils/night-message'

// The count and the rendered message before anything sends (H-108 criterion 4, 0101).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, nightMessageForm)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', { performanceId: input.performanceId })

  return previewNightMessage(input, resolved.night, resolved.account.name)
})
