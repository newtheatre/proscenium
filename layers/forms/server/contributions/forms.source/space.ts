// Spaces of the venues in use, named with their venue.
import { all } from '#kit'
import type { FormsSource } from '../../points/source'
import { like } from './production'

const NAMED = 's.id, s.name || \', \' || v.name AS label FROM core_spaces s JOIN core_venues v ON v.id = s.venue_id'

export default {
  key: 'core.space',
  label: 'forms.sources.core.space',
  allowed: async () => true,
  search: text => all<{ id: string, label: string }>(`SELECT ${NAMED} WHERE v.state = 'active' AND (s.name LIKE ?1 ESCAPE '\\' OR v.name LIKE ?1 ESCAPE '\\') ORDER BY lower(v.name), s.sort, lower(s.name) LIMIT 20`, like(text)), // not-policy: a picker shows a short list
  async labels(ids) {
    const rows = await all<{ id: string, label: string }>(`SELECT ${NAMED} WHERE s.id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids))
    return Object.fromEntries(rows.map(r => [r.id, r.label]))
  },
} satisfies FormsSource
