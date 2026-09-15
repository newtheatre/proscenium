import { londonDayOf } from '#shared/utils/ledger'

// Every size a product sells at, with what it depletes and what it costs today.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const id = getRouterParam(event, 'id') ?? ''

  const product = await productById(id)
  if (!product) throw createError({ statusCode: 404, statusMessage: 'No such product' })

  // Servings are a reading of the movements, so they are answered beside the sizes rather than
  // stored on one (F-128 criterion 7).
  return {
    product,
    variants: await variantsOf(id, londonDayOf(new Date())),
    servings: await servingsAvailableOf(id),
  }
})
