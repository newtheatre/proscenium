// Daily. Warns before a record lapses, digests to the leads on the first, and prunes the ledger.
// It writes only the notification ledger: expiry happens because the calendar moved (G-125).
export default defineTask({
  meta: {
    name: 'training:expiry-sweep',
    description: 'Training expiry warnings and monthly digests, disarmed until turned on',
  },
  async run() {
    return { result: await sweepExpiries(undefined, new Date()) }
  },
})
