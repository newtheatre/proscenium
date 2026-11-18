// Venues in use. Their names are public.
import { all } from '#kit'
import type { FormsSource } from '../../points/source'
import { like } from './production'

export default {
  key: 'core.venue',
  label: 'forms.sources.core.venue',
  allowed: async () => true,
  search: text => all<{ id: string, label: string }>('SELECT id, name AS label FROM core_venues WHERE state = \'active\' AND name LIKE ? ESCAPE \'\\\' ORDER BY lower(name) LIMIT 20', like(text)), // not-policy: a picker shows a short list
  async labels(ids) {
    const rows = await all<{ id: string, label: string }>('SELECT id, name AS label FROM core_venues WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
    return Object.fromEntries(rows.map(r => [r.id, r.label]))
  },
} satisfies FormsSource
