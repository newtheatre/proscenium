// Every bar discount, active and retired: a manager needs to see both to know what a past sale
// could have applied (F-117).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)

  const total = await countDiscounts()
  const items = await listDiscounts(pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
