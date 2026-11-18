// The command palette's search for seasons (core.search-source), by name. There are a handful, so
// it filters in memory as the seasons list does.
import { getQuery } from 'h3'
import { defineRoute } from '#kit'
import { listSeasons } from '../../../programme/service'

const MOST = 20 // not-policy: one page of palette results

export default defineRoute({ ability: 'core.production.view', rateLimit: 'default' }, async (event) => {
  const q = String(getQuery(event).q ?? '').slice(0, 100).trim().toLowerCase() // not-policy: shape bound
  if (!q) return { ids: [] }
  return { ids: (await listSeasons()).filter(s => s.name.toLowerCase().includes(q)).slice(0, MOST).map(s => s.id) }
})
