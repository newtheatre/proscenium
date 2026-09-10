// Runs the retry sweep now, so the backoff clockwork can be exercised without waiting for the cron.
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await requirePermission(event, 'audit.read')
  return await retryDueNotifications(event, new Date())
})
