// Every ten minutes. Sends failed messages again with a doubling backoff until they run out of
// attempts, then leaves them failed for good for somebody to act on (H-105, 0055).
export default defineTask({
  meta: {
    name: 'notifications:retry',
    description: 'Retry failed sends with backoff, and give up visibly when the attempts run out',
  },
  async run() {
    return { result: await retryDueNotifications(undefined, new Date()) }
  },
})
