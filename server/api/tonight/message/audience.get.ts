import { nightAudienceAsked } from '#shared/utils/night-message'

// How many one of tonight's audiences reaches, before a word is written (H-108 criterion 7, 0101).
export default defineEventHandler(async (event) => {
  const asked = await getValidatedQueryOrThrow(event, nightAudienceAsked)
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', { performanceId: asked.performanceId })

  return { count: (await resolveNightAudience(asked.audience, asked.performanceId, resolved.night)).length }
})
