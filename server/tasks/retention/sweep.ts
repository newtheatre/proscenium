// Monthly. Warns twice before anonymising, digests the IT Manager, and ships disarmed until a
// typed confirmation turns it on (K-111).
export default defineTask({
  meta: {
    name: 'retention:sweep',
    description: 'Inactivity warnings and anonymisation, dry-run by default',
  },
  async run() {
    return { result: await sweepRetention(undefined, new Date()) }
  },
})
