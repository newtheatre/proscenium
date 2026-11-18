// The command palette's search for productions (core.search-source): the productions list's own
// search, by title or company, answering ids for the resolver to show.
import { getQuery } from 'h3'
import { defineRoute } from '#kit'
import { listProductions } from '../../../programme/service'

const MOST = 20 // not-policy: one page of palette results

export default defineRoute({ ability: 'core.production.view', rateLimit: 'default' }, async (event) => {
  const q = String(getQuery(event).q ?? '').slice(0, 100) // not-policy: shape bound
  if (!q.trim()) return { ids: [] }
  return { ids: (await listProductions({ q, sort: 'title', order: 'asc', page: 1, size: MOST })).rows.map(r => r.id) }
})
