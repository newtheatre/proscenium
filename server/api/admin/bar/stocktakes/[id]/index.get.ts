// One stocktake with its lines, variance shown in units and at cost before anything is applied
// (F-115 criterion 3).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const id = getRouterParam(event, 'id') ?? ''

  const held = await stocktakeById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such stocktake' })

  return { stocktake: held, lines: await stocktakeLines(id) }
})
