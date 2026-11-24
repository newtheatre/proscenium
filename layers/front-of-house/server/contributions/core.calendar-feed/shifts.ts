// A person's places on shifts, for their one calendar feed (C-70). The words are the duty, the show or
// occasion and the place, never the briefing (CF4); a place given up or a shift called off shows cancelled.
import { all } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { CalendarFeed, CalendarFeedEvent } from '#modules/core'

const GONE = ['declined', 'withdrawn', 'released', 'removed'].map(s => `'${s}'`).join(', ')

interface Row { id: string, state: string, shift_state: string, call_at: number, ends_at: number, updated_at: number, duty: string, title: string | null, production_title: string | null, venue_name: string | null, space_name: string | null }

const SELECT = `SELECT a.id, a.state, s.state AS shift_state, s.call_at, s.ends_at, max(a.updated_at, s.updated_at) AS updated_at, d.name AS duty, s.title, p.title AS production_title, v.name AS venue_name, sp.name AS space_name
  FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
  LEFT JOIN core_performances f ON f.id = s.performance_id LEFT JOIN core_productions p ON p.id = f.production_id
  LEFT JOIN core_venues v ON v.id = coalesce(s.venue_id, f.venue_id) LEFT JOIN core_spaces sp ON sp.id = f.space_id`

const statusOf = (r: Row): CalendarFeedEvent['status'] => r.shift_state === 'cancelled' || GONE.includes(`'${r.state}'`) ? 'cancelled' : r.state === 'requested' ? 'tentative' : 'confirmed'

export default {
  async events(accountId, from, to) {
    const rows = await all<Row>(`${SELECT} WHERE a.account_id IN (${accountScopeSql('?1')}) AND s.state IN ('published', 'completed', 'cancelled') AND s.call_at < ?2 AND s.ends_at > ?3 ORDER BY s.call_at, a.id`, accountId, to, from) // not-policy: numbered parameters
    return rows.map(r => ({
      key: r.id,
      startsAt: r.call_at,
      endsAt: r.ends_at,
      title: r.production_title ? `${r.duty}, ${r.production_title}` : r.title ? `${r.duty}: ${r.title}` : r.duty,
      location: [r.venue_name, r.space_name].filter(Boolean).join(', ') || undefined,
      status: statusOf(r),
      updatedAt: r.updated_at,
    }))
  },
} satisfies CalendarFeed
