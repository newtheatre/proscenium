// Weekly, on the backup trigger; also run by Sync now on the settings card (C-121 criterion 7,
// 0092). A failure is recorded and returned, never thrown, so it reaches the trail and the health check.
export default defineTask({
  meta: {
    name: 'bank-holidays:sync',
    description: 'Copy the England and Wales bank holidays from gov.uk (C-121, 0092)',
  },
  async run() {
    return { result: await syncBankHolidays(undefined, null) }
  },
})
