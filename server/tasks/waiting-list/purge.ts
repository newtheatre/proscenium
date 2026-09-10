// Deletes waiting-list entries once their performance's whole show night has ended (D-113
// criterion 4). Not append-only, unlike the ledger or audit log: nothing else depends on these
// rows surviving (CLAUDE.md).
export default defineTask({
  meta: {
    name: 'waiting-list:purge',
    description: 'Purge waiting-list entries for performances whose night has ended (D-113)',
  },
  async run() {
    const cap = await configValue(undefined, 'WAITING_LIST_PURGE_BATCH_CAP')
    const run = await purgeWaitingListForEndedNights(new Date(), cap)
    return { result: run }
  },
})
