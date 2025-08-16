// Update user contact/notification preferences
// TODO: Add DB model for user preferences
// Can be managed through links at the bottom of emails (e.g. unsubscribe links) so does not need full authentication, unlike PATCH /api/account
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
