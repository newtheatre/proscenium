import { londonDayOf } from '#shared/utils/ledger'

// Every size a product sells at, with what it depletes and what it costs today.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const id = getRouterParam(event, 'id') ?? ''

  const product = await productById(id)
  if (!product) throw createError({ statusCode: 404, statusMessage: 'No such product' })

  return { product, variants: await variantsOf(id, londonDayOf(new Date())) }
})
