// Registered so its cron trigger has a handler; the work arrives with D-106. It reports what it
// is waiting for rather than a count it did not produce.
export default defineTask({
  meta: {
    name: 'holds:release',
    description: 'Release expired reservation holds and cascade waiting-list offers (D-106, not built)',
  },
  run() {
    return { result: { awaiting: 'D-106' } }
  },
})
