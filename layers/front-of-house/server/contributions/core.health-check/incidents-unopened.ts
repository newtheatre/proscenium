// No incident waits unopened past front-of-house.incidents.review-within (part 3, "Review").
import { first, nowMs, useSetting } from '#kit'

const SECOND = 1000 // not-policy: settings are whole seconds

export default {
  async check() {
    const within = await useSetting('front-of-house.incidents.review-within') as number
    const row = await first<{ n: number }>('SELECT count(*) AS n FROM front_of_house_incidents WHERE state = \'reported\' AND reported_at < ?', nowMs() - within * SECOND)
    const n = row?.n ?? 0
    if (!n) return { state: 'ok', sentence: 'Every incident has been opened by a reviewer in time.' }
    return { state: 'warning', sentence: `${n === 1 ? 'One incident has' : `${n} incidents have`} not been opened by a reviewer in time.`, remedy: 'Open Incidents and review those still marked reported.' }
  },
} satisfies { check: () => Promise<{ state: 'ok' | 'warning' | 'failing', sentence: string, remedy?: string }> }
