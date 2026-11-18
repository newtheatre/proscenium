// The performances the person holds tickets for, on My account's Upcoming card (AC-3): one line
// for each performance, with how many tickets, from confirmed orders on their account.
import { all, nowMs } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { UpcomingSource } from '#modules/core'

export default {
  async items(actor, limit) {
    if (!actor.accountId) return []
    const rows = await all<{ performance_id: string, starts_at: number, title: string | null, tickets: number }>(
      `SELECT t.performance_id, f.starts_at, p.title, count(*) AS tickets
         FROM box_office_tickets t
         JOIN box_office_order_lines l ON l.id = t.order_line_id
         JOIN box_office_orders o ON o.id = l.order_id
         JOIN core_performances f ON f.id = t.performance_id
         LEFT JOIN core_productions p ON p.id = f.production_id
        WHERE o.account_id IN (${accountScopeSql('?1')}) AND o.state = 'confirmed' AND t.state = 'valid' AND f.starts_at >= ?2 AND f.state <> 'cancelled'
        GROUP BY t.performance_id, f.starts_at, p.title
        ORDER BY f.starts_at LIMIT ?3 -- not-policy: numbered parameters
      `,
      actor.accountId, nowMs(), limit)
    return rows.map(r => ({ id: r.performance_id, at: r.starts_at, icon: 'i-lucide-ticket', title: r.title, label: 'box-office.upcoming.tickets', params: { count: r.tickets } }))
  },
} satisfies UpcomingSource
