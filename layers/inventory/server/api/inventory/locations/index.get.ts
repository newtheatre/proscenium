// The locations tree (INV-07), with the venues and spaces a location may be in.
import { defineRoute } from '#kit'
import { listVenues } from '#modules/core'
import { listLocations } from '../../../locations'

export default defineRoute({ ability: 'inventory.setup.manage', rateLimit: 'default' }, async () => {
  const [locations, venues] = await Promise.all([listLocations(), listVenues()])
  return {
    locations,
    venues: venues.map(v => ({ id: v.id, name: v.name, spaces: v.spaces.filter(s => !s.archived).map(s => ({ id: s.id, name: s.name })) })),
  }
})
