// Every ten minutes. Flushes every topic+person digest whose window has passed into one email,
// so a run of unrelated changes still lands as the messages a member actually gets (H-104).
export default defineTask({
  meta: {
    name: 'notifications:digest',
    description: 'Send every digest whose window has passed, one email per topic per person',
  },
  async run() {
    return { result: { sent: await sendDueDigests(undefined, new Date()) } }
  },
})
