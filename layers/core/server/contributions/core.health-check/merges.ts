// Health: a merge whose rows are still moving a day after it was made (part 4, Merge), naming the
// modules holding it up, so a stuck merge is seen by somebody. Readers are unaffected meanwhile.
import type { HealthCheck } from '../../points/health-check'
import { stuckMerges } from '../../identity/merge-move'

export default {
  async check() {
    const stuck = await stuckMerges()
    if (!stuck.length) return { state: 'ok', sentence: 'No merge of accounts is stuck.' }
    const modules = [...new Set(stuck.flatMap(s => s.modules))].sort()
    return {
      state: 'warning',
      sentence: `${stuck.length === 1 ? 'A merge of accounts has' : `${stuck.length} merges of accounts have`} been moving rows for more than a day${modules.length ? `, held up by ${modules.join(', ')}` : ''}.`,
      remedy: 'Look at the module\'s jobs for what it is waiting for. People see both accounts\' records meanwhile, so nothing is missing.',
    }
  },
} satisfies HealthCheck
