// The practice surfaces and what teaching opens each of them.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'training.read')
  const items = await listPracticeTargets()
  return { items, total: items.length }
})
