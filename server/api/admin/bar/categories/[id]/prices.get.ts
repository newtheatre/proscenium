import { londonDayOf } from '#shared/utils/ledger'

// A category's whole default-price history across every serving kind, each kind's winner marked.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const id = getRouterParam(event, 'id') ?? ''
  const on = londonDayOf(new Date())

  const category = await categoryById(id)
  if (!category) throw createError({ statusCode: 404, statusMessage: 'No such category' })

  return { category, on, prices: await categoryPriceHistory(id, on) }
})
