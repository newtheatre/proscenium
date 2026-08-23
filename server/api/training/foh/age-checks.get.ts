/** GET /api/training/foh/age-checks: this run's own entries, and nobody else's. */
export default defineEventHandler(async (event) => {
  const { run } = await requireRun(event, 'challenge-25')

  const events = (await eventsFor(run.id)).filter(item => item.kind === 'AGE_CHECK')
  const accepted = events.filter(item => item.payload?.outcome === 'ACCEPTED').length

  return {
    tonight: { accepted, refused: events.length - accepted },
    // Never the real register: a trainee sees what they entered and no more.
    entries: events.map(item => ({ id: item.id, at: item.at, ...item.payload })),
  }
})
