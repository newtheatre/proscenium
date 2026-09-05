// Live on-hand against par, on demand, never a stored order (F-120 criteria 2, 5).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  return { shortfalls: await shortfalls(), unconfigured: await unconfiguredItems() }
})
