// The shifts the person is on, on My account's Upcoming card (AC-3), each opening the shift.
import { all, nowMs } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { UpcomingSource } from '#modules/core'
import { LIVE_STATES } from '../../db/schema'

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')

export default {
  async items(actor, limit) {
    if (!actor.accountId) return []
    const rows = await all<{ shift_id: string, call_at: number, title: string | null, production_title: string | null, duty_name: string }>(
      `SELECT s.id AS shift_id, s.call_at, s.title, p.title AS production_title, d.name AS duty_name
         FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
         LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
        WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${live}) AND s.call_at >= ?2
        ORDER BY s.call_at LIMIT ?3 -- not-policy: numbered parameters
      `,
      actor.accountId, nowMs(), limit)
    return rows.map(r => ({ id: r.shift_id, at: r.call_at, icon: 'i-lucide-calendar-clock', title: r.production_title ?? r.title, label: 'front-of-house.upcoming.shift', params: { duty: r.duty_name }, to: `/members/front-of-house/shifts/${r.shift_id}` }))
  },
} satisfies UpcomingSource
