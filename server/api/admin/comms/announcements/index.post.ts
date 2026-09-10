import { composeAnnouncementForm } from '#shared/utils/announcements'

// Send to a resolved audience, one message per recipient (H-108). Audited with sender, audience
// and count; per-recipient outcomes are the send log's own rows, written by `notify()`.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'comms.announce')
  const input = await readValidatedBodyOrThrow(event, composeAnnouncementForm)

  const { count } = await sendAnnouncement(event, resolved.account.id, input)

  return { count }
})
