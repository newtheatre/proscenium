// Registered so its cron trigger has a handler; the work arrives with G-119. It reports what it
// is waiting for rather than a count it did not produce.
export default defineTask({
  meta: {
    name: 'sessions:sweep',
    description: 'Session reminders and unmarked-register nags (G-119, not built)',
  },
  run() {
    return { result: { awaiting: 'G-119' } }
  },
})
