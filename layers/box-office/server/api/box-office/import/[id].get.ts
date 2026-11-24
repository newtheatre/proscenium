// What became of an import of bookings: how many orders it made, and the tickets each performance
// now holds from it, for checking against the other system's own figures.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { importSummary } from '../../../importing'

export default defineRoute({
  ability: 'box-office.order.import',
  rateLimit: 'staff',
}, async (event) => {
  return importSummary(getRouterParam(event, 'id', { decode: true }) ?? '')
})
