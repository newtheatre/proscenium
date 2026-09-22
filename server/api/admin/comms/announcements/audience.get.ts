import { audienceFromQuery } from '#shared/utils/announcements'

// How many an audience resolves to, before a subject or a message exists (H-108 criterion 7).
// The same resolver a preview and a send call, so the count can never name a different set.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'comms.announce')
  const audience = await getValidatedQueryOrThrow(event, audienceFromQuery)

  return { count: (await resolveAudience(event, audience)).length }
})
