// What people are asking for, busiest first, scoped to what the reader stewards. Whether the reader
// may schedule is said here, so a lead with no trainer standing is not offered it (0242).
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueReader(event)
  const items = await demandBoard(scopeToLeadOf(resolved))
  const maySchedule = resolved.permissions.has('training.write')
    || (await trainerStandingOf(resolved.account.id, londonToday())).trainer
  return { items, total: items.length, truncated: items.length >= DEMAND_BOARD_LIMIT, maySchedule }
})
