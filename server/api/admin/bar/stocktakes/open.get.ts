import { countedBlind } from '#shared/utils/stocktakes'

// The open stocktake and its lines for whoever may count into it, a holder of bar.stocktake or
// tonight's confirmed bar shift (0099). None open is an answer, not a refusal.
export default defineEventHandler(async (event) => {
  const held = await openStocktake()
  const reader = await requireStocktakeReader(event, held)
  const lines = held ? await stocktakeLines(held.id) : []
  return { stocktake: held ?? null, lines: reader.blind ? lines.map(countedBlind) : lines }
})
