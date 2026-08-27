// Registered so its cron trigger has a handler; the work arrives with K-111. It reports what it
// is waiting for rather than a count it did not produce.
export default defineTask({
  meta: {
    name: 'retention:sweep',
    description: 'Inactivity warnings and anonymisation, dry-run by default (K-111, not built)',
  },
  run() {
    return { result: { awaiting: 'K-111' } }
  },
})
