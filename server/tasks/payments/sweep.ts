// An unanswered SumUp hand-off is abandoned after the configured window, and a completion stuck
// past its own is marked for a person to look at (F-124 criterion 5).
export default defineTask({
  meta: {
    name: 'payments:sweep',
    description: 'Abandon SumUp hand-offs nobody answered and flag completions that never finished (F-124)',
  },
  async run() {
    const timeoutMinutes = await configValue(undefined, 'SUMUP_ATTEMPT_TIMEOUT_MINUTES')
    const swept = await sweepAttempts(timeoutMinutes)
    return { result: swept }
  },
})
