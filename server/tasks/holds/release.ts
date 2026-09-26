// Releases first, so a reminder that cannot mint its link never stops a hold releasing; the two
// windows never overlap, a reminder firing before expiry and release at or after it (D-106, D-107).
export default defineTask({
  meta: {
    name: 'holds:release',
    description: 'Release expired reservation holds and send pre-expiry hold reminders (D-106, D-107)',
  },
  async run() {
    const cap = await configValue(undefined, 'HOLD_RELEASE_BATCH_CAP')
    const now = new Date()
    const released = await releaseExpiredHolds(now, cap)
    await notifyWaitingListOffers(undefined, released.offered)
    const reminders = await sendHoldReminders(undefined, now, cap, reservationId => bookingLinkFor(undefined, reservationId))
    return { result: { reminders, released: { eligible: released.eligible, released: released.released, offered: released.offered.length } } }
  },
})
