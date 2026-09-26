// One stocktake with its lines, variance shown in units and at cost before anything is applied
// (F-115 criterion 3); tonight's bar shift reads it while it is open (0099).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''

  const held = await stocktakeById(id)
  await requireStocktakeReader(event, held)
  if (!held) throw noSuch('stocktake')

  return { stocktake: held, lines: await stocktakeLines(id) }
})
