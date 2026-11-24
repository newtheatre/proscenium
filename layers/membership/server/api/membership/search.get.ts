// The command palette's search for members (tab 4, core.search-source): the members list's own search,
// by name, address or member number, answering membership ids for the resolver to show.
import { getQuery } from 'nuxt/server'
import { defineRoute } from '#kit'
import { readMembers } from '../../members'

export default defineRoute({ ability: 'membership.membership.view', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const q = String(getQuery(event).q ?? '').slice(0, 100) // not-policy: shape bound
  if (!q.trim()) return { ids: [] }
  return { ids: (await readMembers({ q }, actor, unit.view())).rows.map(r => r.id) }
})
