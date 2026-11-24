// What is on sale for a performance and what it costs, for anyone. It says whether a band has
// seats, never how many the house holds or how many are sold.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { availability } from '../../../availability'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const found = await availability(getRouterParam(event, 'id', { decode: true })!)
  return {
    performanceId: found.performanceId,
    state: found.state,
    onSaleAt: found.onSaleAt,
    currency: found.currency,
    bands: found.bands.map(b => ({ bandId: b.bandId, name: b.name, kind: b.kind, available: b.free > 0, lowestMinor: b.lowestMinor, prices: b.prices })),
  }
})
