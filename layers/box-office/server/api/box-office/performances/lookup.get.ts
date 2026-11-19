// Performances for the Orders list's performance filter: those Box office sells, nearest in time
// first, found by show title (?q=) and narrowed to a show when the show filter is on (?show=), or
// turned from ids into "Show, date and time" (?ids=).
import { getQuery } from 'h3'
import { all, defineRoute, nowMs, theatreTimeZone, useSetting } from '#kit'

const MOST = 25 // not-policy: as many as a picker shows

interface Found { value: string, title: string, label: string | null, starts_at: number }

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async (event) => {
  const query = getQuery(event) as Record<string, string | undefined>
  const ids = (query.ids ?? '').split(',').filter(Boolean)
  const show = (query.show ?? '').trim()
  const found = ids.length
    ? await all<Found>(
        `SELECT f.id AS value, p.title, f.label, f.starts_at FROM core_performances f JOIN core_productions p ON p.id = f.production_id
          WHERE f.id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids))
    : await all<Found>(
        `SELECT f.id AS value, p.title, f.label, f.starts_at FROM core_performances f JOIN core_productions p ON p.id = f.production_id
          JOIN box_office_performance_sales s ON s.performance_id = f.id
          WHERE instr(lower(p.title), lower(?)) AND (? = '' OR f.production_id = ?)
          ORDER BY abs(f.starts_at - ?), f.id LIMIT ${MOST}`,
        (query.q ?? '').trim(), show, show, nowMs())
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const when = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: await theatreTimeZone() })
  return { rows: found.map(f => ({ value: f.value, label: [f.title, f.label, when.format(f.starts_at)].filter(Boolean).join(', ') })) }
})
