// Registered so its cron trigger has a handler; the work arrives with E-125. It reports what it
// is waiting for rather than a count it did not produce.
export default defineTask({
  meta: {
    name: 'nights:close',
    description: 'Auto-close unsigned night reports inside 24 hours (E-125, not built)',
  },
  run() {
    return { result: { awaiting: 'E-125' } }
  },
})
