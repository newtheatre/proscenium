// A pass request lapses once its product's own sales window has closed, unfulfilled (D-124
// criterion 3), the same shape D-106's hold release uses.
export default defineTask({
  meta: {
    name: 'passes:expire-requests',
    description: 'Lapse pass requests still pending once their product\'s sales window has closed',
  },
  async run() {
    const cap = await configValue(undefined, 'PASS_REQUEST_EXPIRE_BATCH_CAP')
    return { result: await expireStalePassRequests(new Date(), cap) }
  },
})
