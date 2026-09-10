// Runs the digest sweep now, so a held entry's flush can be exercised without waiting for the cron.
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await requirePermission(event, 'audit.read')
  return { sent: await sendDueDigests(event, new Date()) }
})
