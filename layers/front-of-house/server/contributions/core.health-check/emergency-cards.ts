// Every venue with a coming performance in a space the theatre manages has an emergency card
// reviewed within front-of-house.emergency.review-every (part 5, core.health-check).
import { all, localDate, nowMs, useSetting } from '#kit'

const SECOND = 1000 // not-policy: settings are whole seconds

export default {
  async check() {
    const every = await useSetting('front-of-house.emergency.review-every') as number
    const since = await localDate(nowMs() - every * SECOND)
    const venues = await all<{ name: string }>(
      `SELECT DISTINCT v.name FROM core_performances p JOIN core_venues v ON v.id = p.venue_id JOIN core_spaces s ON s.id = p.space_id
        WHERE p.starts_at > ? AND p.state = 'scheduled' AND s.managed = 1
          AND NOT EXISTS (SELECT 1 FROM front_of_house_emergency_cards e WHERE e.venue_id = v.id AND e.reviewed_on >= ?)
        ORDER BY v.name`, nowMs(), since)
    if (!venues.length) return { state: 'ok', sentence: 'Every venue with a performance coming up has an emergency card reviewed recently.' }
    return { state: 'warning', sentence: `No emergency card reviewed recently for ${venues.map(v => v.name).join(', ')}.`, remedy: 'Open Emergency cards, check each card through and save it as reviewed.' }
  },
} satisfies { check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string }> }
