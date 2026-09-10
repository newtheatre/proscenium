import { composeAnnouncementForm } from '#shared/utils/announcements'

// The resolved recipient count and the rendered message, before anything sends (H-108 criterion 4).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'comms.announce')
  const input = await readValidatedBodyOrThrow(event, composeAnnouncementForm)

  return previewAnnouncement(event, input, resolved.account.name)
})
