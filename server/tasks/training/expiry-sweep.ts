// Registered so its cron trigger has a handler; the work arrives with G-125. It reports what it
// is waiting for rather than a count it did not produce.
export default defineTask({
  meta: {
    name: 'training:expiry-sweep',
    description: 'Training expiry warnings and digests (G-125, not built)',
  },
  run() {
    return { result: { awaiting: 'G-125' } }
  },
})
