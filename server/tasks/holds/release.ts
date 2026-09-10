// Reminds first, releases second, though the two windows never overlap: a reminder fires before
// expiry and release only at or after it (D-106, D-107).
export default defineTask({
  meta: {
    name: 'holds:release',
    description: 'Send pre-expiry hold reminders and release expired reservation holds (D-106, D-107)',
  },
  async run() {
    const cap = await configValue(undefined, 'HOLD_RELEASE_BATCH_CAP')
    const now = new Date()
    const reminders = await sendHoldReminders(undefined, now, cap)
    const released = await releaseExpiredHolds(now, cap)
    await notifyWaitingListOffers(undefined, released.offered)
    return { result: { reminders, released: { eligible: released.eligible, released: released.released, offered: released.offered.length } } }
  },
})
