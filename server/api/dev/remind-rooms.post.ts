// Runs tomorrow's reminders now, so the clockwork can be exercised without waiting for the cron.
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await requirePermission(event, 'rooms.write')
  return await remindTomorrow(event, new Date())
})
