// Performances: the scheduled ones of published productions for anybody, and every one for somebody
// who works on the programme. Named by the production and when it starts.
import { all, can, theatreTimeZone } from '#kit'
import type { FormsSource } from '../../points/source'
import { like } from './production'

async function named(rows: { id: string, title: string, startsAt: number }[]): Promise<{ id: string, label: string }[]> {
  const when = new Intl.DateTimeFormat('en-GB', { timeZone: await theatreTimeZone(), weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return rows.map(r => ({ id: r.id, label: `${r.title}, ${when.format(r.startsAt)}` }))
}

export default {
  key: 'core.performance',
  label: 'forms.sources.core.performance',
  allowed: async () => true,
  async search(text, actor) {
    const every = (await can(actor, 'core.production.view')).allowed
    return named(await all<{ id: string, title: string, startsAt: number }>(
      `SELECT f.id, p.title, f.starts_at AS startsAt FROM core_performances f JOIN core_productions p ON p.id = f.production_id
       WHERE p.title LIKE ?1 ESCAPE '\\' AND (?2 OR (f.state = 'scheduled' AND p.state = 'published' AND p.listed = 1)) ORDER BY f.starts_at DESC LIMIT 20`, // not-policy: a picker shows a short list
      like(text), every ? 1 : 0))
  },
  async labels(ids) {
    const rows = await all<{ id: string, title: string, startsAt: number }>('SELECT f.id, p.title, f.starts_at AS startsAt FROM core_performances f JOIN core_productions p ON p.id = f.production_id WHERE f.id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
    return Object.fromEntries((await named(rows)).map(r => [r.id, r.label]))
  },
} satisfies FormsSource
