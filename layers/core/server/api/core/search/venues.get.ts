// The command palette's search for venues (core.search-source), by the venue's or a space's name,
// as the venues list searches.
import { getQuery } from 'h3'
import { defineRoute } from '#kit'
import { listVenues } from '../../../places/service'

const MOST = 20 // not-policy: one page of palette results

export default defineRoute({ ability: 'core.venue.manage', rateLimit: 'default' }, async (event) => {
  const q = String(getQuery(event).q ?? '').slice(0, 100).trim().toLowerCase() // not-policy: shape bound
  if (!q) return { ids: [] }
  const found = (await listVenues({ archived: true })).filter(v => v.name.toLowerCase().includes(q) || v.spaces.some(s => s.name.toLowerCase().includes(q)))
  return { ids: found.slice(0, MOST).map(v => v.id) }
})
