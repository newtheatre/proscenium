import { countedBlind } from '#shared/utils/stocktakes'

// One stocktake with its lines, variance shown in units and at cost before anything is applied
// (F-115 criterion 3); tonight's bar shift reads it, blind, while it is open (0099).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''

  const held = await stocktakeById(id)
  const reader = await requireStocktakeReader(event, held)
  if (!held) throw noSuch('stocktake')

  const lines = await stocktakeLines(id)
  return { stocktake: held, lines: reader.blind ? lines.map(countedBlind) : lines }
})
