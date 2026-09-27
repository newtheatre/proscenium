import { audienceFromQuery, isTicketHolderAudience } from '#shared/utils/announcements'

// How many an audience resolves to, before a subject or a message exists (H-108 criterion 7).
// The same resolver a preview and a send call, so the count can never name a different set.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'comms.announce')
  const audience = await getValidatedQueryOrThrow(event, audienceFromQuery)

  // The plain type's own digest window, so the composer says when it would go (issue 1327, 0012).
  const digestMinutes = isTicketHolderAudience(audience.kind)
    ? await configValue(event, 'NOTIFICATION_DIGEST_WINDOW_BOOKINGS_MINUTES')
    : await configValue(event, 'NOTIFICATION_DIGEST_WINDOW_ANNOUNCEMENTS_MINUTES')

  return { count: (await resolveAudience(event, audience)).length, digestMinutes }
})
