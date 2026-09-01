// The estate booking numbers, so a screen mirrors the rules rather than restating them.
export default defineEventHandler(async (event) => {
  await requireAccount(event)
  const estate = await estatePolicy(event)

  return {
    ...estate,
    seriesCap: await configValue(event, 'ROOM_SERIES_MAX_OCCURRENCES'),
  }
})
