// Runs tomorrow's shift reminders now, so the clockwork can be exercised without the cron.
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await requirePermission(event, 'rota.write')
  return await remindShiftsTomorrow(event, new Date())
})
