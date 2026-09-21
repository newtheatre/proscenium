// One hand-off's state, polled by the till while it waits for the app to come back (F-124
// criterion 5). Guarded as the till is; the keyed return route is the session-less path.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const row = await attemptById(id)
  if (!row) throw noSuch('SumUp attempt')

  await requireNightAuthority(event, 'BAR', { venueId: row.venueId })

  return { attempt: view(row) }
})
