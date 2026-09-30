// Who may be named to teach a session: everybody holding trainer standing today, ids and names only,
// for the Theatre Manager who alone names somebody else (G-112 as amended, issue 1336).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'training.write')
  return { items: await currentTrainers(londonToday()) }
})
