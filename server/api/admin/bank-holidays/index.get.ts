// The settings card's read of the last sync and its failure, beside the list it already has
// (C-121 criterion 8, 0091).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'config.read')
  const { ok, status, syncedAt, failedAt, failure } = await bankHolidaySync()
  return { ok, status, syncedAt, failedAt, failure }
})
