// Productions: the published ones for anybody, and every one for somebody who works on the programme.
import { all, can } from '#kit'
import type { FormsSource } from '../../points/source'

export default {
  key: 'core.production',
  label: 'forms.sources.core.production',
  allowed: async () => true,
  async search(text, actor) {
    const every = (await can(actor, 'core.production.view')).allowed
    return all<{ id: string, label: string }>(
      'SELECT id, title AS label FROM core_productions WHERE title LIKE ?1 ESCAPE \'\\\' AND (?2 OR (state IN (\'published\', \'cancelled\') AND listed = 1)) ORDER BY created_at DESC LIMIT 20', // not-policy: a picker shows a short list
      like(text), every ? 1 : 0)
  },
  async labels(ids) {
    const rows = await all<{ id: string, label: string }>('SELECT id, title AS label FROM core_productions WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
    return Object.fromEntries(rows.map(r => [r.id, r.label]))
  },
} satisfies FormsSource

/** What was typed, anywhere in the name, with LIKE's own wildcards taken literally. */
export const like = (text: string): string => `%${text.trim().replace(/[\\%_]/g, c => `\\${c}`)}%`
