// Messages that did not reach anybody, newest first.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'audit.read')
  const items = await recentDeliveryTrouble()
  return { items, total: items.length }
})
