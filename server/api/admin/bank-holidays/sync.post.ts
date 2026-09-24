// Sync now: the same run the weekly task makes, with the person who asked as the run's actor and
// never as the list's (C-121 criterion 7, 0092). A failure is an answer, not an error.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'config.write')
  return await syncBankHolidays(event, resolved.account.id)
})
