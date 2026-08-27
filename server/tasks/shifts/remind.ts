// Registered so its cron trigger has a handler; the work arrives with E-109. It reports what it
// is waiting for rather than a count it did not produce.
export default defineTask({
  meta: {
    name: 'shifts:remind',
    description: 'The next day rota with calendar attachments (E-109, not built)',
  },
  run() {
    return { result: { awaiting: 'E-109' } }
  },
})
