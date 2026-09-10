// Lapses offers past their window, then re-offers the seat each lapse gives back (D-113 criteria
// 2, 3). Every other freeing event offers inline; this is the one with no such point to hook.
export default defineTask({
  meta: {
    name: 'waiting-list:sweep',
    description: 'Lapse expired waiting-list offers and re-offer what they free (D-113)',
  },
  async run() {
    const cap = await configValue(undefined, 'WAITING_LIST_OFFER_BATCH_CAP')
    const now = new Date()
    const lapsed = await lapseExpiredOffers(now, cap)

    let reoffered = 0
    for (const performanceId of lapsed.performanceIds) {
      const run = await offerWaitingList(undefined, performanceId, now, cap)
      await notifyWaitingListOffers(undefined, run.offered)
      reoffered += run.offered.length
    }

    return { result: { lapsed: lapsed.lapsed, reoffered } }
  },
})
