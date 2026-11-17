// Health: unfinished content warnings after the slice that graded them. A warning carried across
// from before levels existed shows no level word until a person grades it, and a production
// published before staging effects were asked about has no answer on them.
import { all } from '#kit'
import type { HealthCheck } from '../../points/health-check'

const names = (rows: { title: string }[], total: number) => `${rows.map(r => r.title).join(', ')}${total > rows.length ? ` and ${total - rows.length} more` : ''}`

export default {
  async check() {
    const assumed = await all<{ title: string }>('SELECT DISTINCT p.title FROM core_production_advisories a JOIN core_productions p ON p.id = a.production_id WHERE a.level_assumed = 1 ORDER BY p.title')
    const unanswered = await all<{ title: string }>(`SELECT p.title FROM core_productions p WHERE p.state = 'published' AND p.effects_confirmed_none = 0
      AND NOT EXISTS (SELECT 1 FROM core_production_effects e WHERE e.production_id = p.id) ORDER BY p.title`)
    if (!assumed.length && !unanswered.length) return { state: 'ok', sentence: 'Every content warning has a level and every published production has answered on staging effects.' }
    const parts: string[] = []
    const remedy: string[] = []
    if (assumed.length) {
      parts.push(`${assumed.length === 1 ? '1 production has' : `${assumed.length} productions have`} content warnings with no level yet, so the page shows them without one`)
      remedy.push(`Open ${names(assumed.slice(0, 3), assumed.length)}, set the real level of each warning on the Age, effects and warnings tab, and save.`)
    }
    if (unanswered.length) {
      parts.push(`${unanswered.length === 1 ? '1 published production has' : `${unanswered.length} published productions have`} not said whether it uses staging effects`)
      remedy.push(`List the effects, or confirm there are none, for ${names(unanswered.slice(0, 3), unanswered.length)}.`)
    }
    return { state: 'warning', sentence: `${parts.join('; ')}.`, remedy: remedy.join(' ') }
  },
} satisfies HealthCheck
