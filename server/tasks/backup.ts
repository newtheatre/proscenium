// Registered so its cron trigger has a handler; the work arrives with K-108. It reports what it
// is waiting for rather than a count it did not produce.
export default defineTask({
  meta: {
    name: 'backup',
    description: 'Weekly export to R2 (K-108, not built)',
  },
  run() {
    return { result: { awaiting: 'K-108' } }
  },
})
