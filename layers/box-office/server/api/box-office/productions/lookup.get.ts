// Shows for the Orders list's show filter: those with a performance Box office sells, found by title
// (?q=) nearest in time first, or turned from ids into titles (?ids=).
import { getQuery } from 'nuxt/server'
import { all, defineRoute, nowMs } from '#kit'

const MOST = 25 // not-policy: as many as a picker shows

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async (event) => {
  const query = getQuery(event) as Record<string, string | undefined>
  const ids = (query.ids ?? '').split(',').filter(Boolean)
  if (ids.length) {
    return { rows: await all<{ value: string, label: string }>('SELECT id AS value, title AS label FROM core_productions WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids)) }
  }
  const rows = await all<{ value: string, label: string }>(
    `SELECT p.id AS value, p.title AS label FROM core_productions p
      JOIN core_performances f ON f.production_id = p.id JOIN box_office_performance_sales s ON s.performance_id = f.id
      WHERE instr(lower(p.title), lower(?)) GROUP BY p.id, p.title ORDER BY min(abs(f.starts_at - ?)), p.title LIMIT ${MOST}`,
    (query.q ?? '').trim(), nowMs())
  return { rows }
})
