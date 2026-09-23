// The theatre's seasons for the money dashboard's SEASON picker (0087): a name and its days, open
// to `finance.summary` like the terms, so the treasurer needs no box office permission to choose.
export default defineEventHandler(async (event) => {
  await requireAnyPermission(event, ['finance.read', 'finance.summary'])
  return { seasons: await financeSeasons() }
})
