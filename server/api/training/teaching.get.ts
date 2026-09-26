// The sessions a member teaches that still need them: coming, or opened and not yet marked. Empty
// rather than refused for somebody who teaches nothing, so My training can always ask (issue 1336).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const sessions = await listSessions({ trainerId: account.id, stillToRun: londonToday() })

  return {
    items: sessions.map(({ id, heldOn, startsAt, endsAt, place, status, modules }) => ({ id, heldOn, startsAt, endsAt, place, status, modules })),
  }
})
