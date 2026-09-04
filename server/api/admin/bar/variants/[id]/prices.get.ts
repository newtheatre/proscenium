import { londonDayOf } from '#shared/utils/ledger'

// The whole price history of one serving size, newest first, with the row today resolves to.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const id = getRouterParam(event, 'id') ?? ''
  const on = londonDayOf(new Date())

  const variant = await variantById(id, on)
  if (!variant) throw createError({ statusCode: 404, statusMessage: 'No such serving size' })

  return { variant, on, prices: await priceHistory(id, on) }
})
