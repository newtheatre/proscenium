// Amber when a search index is out of step with its table or lacks secure-delete (S4), so an erased
// value could linger in it. The daily core.search-rebuild task mends both.
import type { HealthCheck } from '../../points/health-check'
import { useContext } from '#kit'
import { searchIndexStates } from '#kit/search'

export default {
  async check() {
    const states = await searchIndexStates(useContext().env.DB)
    const insecure = states.filter(s => !s.secureDelete)
    if (insecure.length) return { state: 'warning', sentence: `${insecure.length === 1 ? 'A search index does' : `${insecure.length} search indexes do`} not remove erased words at once.`, remedy: 'The daily search rebuild turns this back on. Check that scheduled tasks are running.' }
    const behind = states.filter(s => s.indexed !== s.rows)
    if (behind.length) return { state: 'warning', sentence: `${behind.length === 1 ? 'A search index is' : `${behind.length} search indexes are`} out of step with ${behind.length === 1 ? 'its list' : 'their lists'}, so searches may miss rows.`, remedy: 'The daily search rebuild refills them. Check that scheduled tasks are running.' }
    return { state: 'ok', sentence: states.length ? `${states.length === 1 ? 'The search index is' : `All ${states.length} search indexes are`} up to date.` : 'No list is searched yet.' }
  },
} satisfies HealthCheck
