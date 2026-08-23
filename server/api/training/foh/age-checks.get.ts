/** GET /api/training/foh/age-checks: this run's own entries, and nobody else's. */
export default defineEventHandler(async (event) => {
  const { run, user } = await requireRun(event, 'challenge-25')

  const events = (await eventsFor(run.id)).filter(item => item.kind === 'AGE_CHECK')
  const outcome = (item: typeof events[number]) => item.payload?.outcome

  // The same envelope as the real route: one page reads both, so a shape of
  // its own would render blank counters in practice (docs/14 §8).
  return {
    night: 'practice',
    accepted: events.filter(item => outcome(item) === 'ACCEPTED').length,
    refused: events.filter(item => outcome(item) === 'REFUSED').length,
    entries: events
      .filter(item => outcome(item) === 'REFUSED')
      .reverse()
      .map(item => ({
        id: item.id,
        outcome: 'REFUSED' as const,
        reason: (item.payload?.reason as string | null) ?? null,
        productDescription: (item.payload?.productDescription as string | null) ?? null,
        description: (item.payload?.description as string | null) ?? null,
        notes: (item.payload?.notes as string | null) ?? null,
        supersedesId: (item.payload?.supersedesId as string | null) ?? null,
        checkedAt: item.at,
        checkedByName: user.name,
      })),
  }
})
