// Staging effects or a depicted content warning were added to a production (C-57): people already
// booked to see it are told, so they can decide to come or to exchange.
import { defineListener } from '#kit'
import { guidanceAdded } from '../guidance-told'

export default defineListener(async (event, unit) => {
  const { productionId, guidanceAdded: added } = event.payload as { productionId: string, guidanceAdded?: { effectTermIds: string[], warnings: { termId: string, level: string }[] } }
  if (added) await guidanceAdded(unit, productionId, { effectTermIds: added.effectTermIds, depicted: added.warnings.some(w => w.level === 'depicted') }, event.id)
})
