// What people are asking for, busiest first, scoped to what the reader stewards.
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueReader(event)
  const items = await demandBoard(scopeToLeadOf(resolved))
  return { items, total: items.length }
})
