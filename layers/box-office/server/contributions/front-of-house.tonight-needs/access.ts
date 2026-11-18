// Box office's part of the Needs tonight panel (front-of-house.tonight-needs; AC-1): each booker with
// tickets for the performance who is on the access scheme and shares their arrangements for the
// night, with the bands they sit in. The kinds of help only: accessNeedsFor leaves notes out for this
// purpose, and audits each read with whoever is looking. Front of house asks only for the person
// leading the night, checked on the performance, so the purpose's own ability check (on the person)
// is answered by that.
import type { Actor, UnitView } from '#kit'
import { all } from '#kit'
import { accessNeedsFor, accountLabel } from '#modules/core'

const CHECKED: Actor = { kind: 'system' }

export default {
  async read(unit: UnitView, performanceId: string) {
    const bookers = await all<{ account_id: string, seats: string | null }>(
      `SELECT o.account_id, group_concat(DISTINCT coalesce(b.name, y.name)) AS seats FROM box_office_tickets t
        JOIN box_office_order_lines l ON l.id = t.order_line_id JOIN box_office_orders o ON o.id = l.order_id
        LEFT JOIN box_office_bands b ON b.id = l.band_id LEFT JOIN box_office_ticket_types y ON y.id = l.ticket_type_id
        WHERE t.performance_id = ? AND t.state = 'valid' AND o.account_id IS NOT NULL
          AND o.account_id IN (SELECT account_id FROM core_access_profiles WHERE status = 'accepted')
        GROUP BY o.account_id`, performanceId)
    const out = []
    for (const b of bookers) {
      const shared = await accessNeedsFor(unit, CHECKED, b.account_id, 'box-office.on-the-night', ['core.performance', performanceId])
      if (!shared || (!shared.needs.length && !shared.companions)) continue
      out.push({
        name: await accountLabel(b.account_id),
        seat: b.seats ? b.seats.split(',').join(', ') : null,
        needs: shared.needs.map(n => ({ key: n.key, label: n.label })),
        companions: shared.companions,
      })
    }
    return out
  },
}
