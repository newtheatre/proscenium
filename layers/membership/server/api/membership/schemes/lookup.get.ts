// Schemes for the members list's scheme filter: found by name (?q=) or turned from ids into names
// (?ids=). Archived schemes are included, since their members are still listed.
import { getQuery } from 'nuxt/server'
import { all, defineRoute } from '#kit'

export default defineRoute({ ability: 'membership.membership.view', rateLimit: 'default' }, async (event) => {
  const query = getQuery(event) as Record<string, string | undefined>
  const ids = (query.ids ?? '').split(',').filter(Boolean)
  const rows = ids.length
    ? await all<{ value: string, label: string }>(`SELECT id AS value, name AS label FROM membership_schemes WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids)
    : await all<{ value: string, label: string }>('SELECT id AS value, name AS label FROM membership_schemes WHERE name LIKE ? ORDER BY name LIMIT 25', `%${(query.q ?? '').trim()}%`)
  return { rows }
})
