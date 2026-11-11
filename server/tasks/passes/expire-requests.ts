// A pass request lapses once its product's own sales window has closed, unfulfilled (D-124
// criterion 3); an unpaid pass lapses then too, or at its validity's end (D-139 criterion 4).
export default defineTask({
  meta: {
    name: 'passes:expire-requests',
    description: 'Lapse pass requests and unpaid passes once their product\'s sales window has closed',
  },
  async run() {
    const cap = await configValue(undefined, 'PASS_REQUEST_EXPIRE_BATCH_CAP')
    const now = new Date()
    return { result: { requests: await expireStalePassRequests(now, cap), unpaid: await lapseUnpaidPasses(now, cap) } }
  },
})
