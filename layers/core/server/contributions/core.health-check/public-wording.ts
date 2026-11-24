// Health: a season that two modules both give public words to (C-67). The first in manifest order is used.
import type { HealthCheck } from '../../points/health-check'
import { wordingClashes } from '../../programme/wording'

export default {
  async check() {
    const clashes = await wordingClashes()
    if (!clashes.length) return { state: 'ok', sentence: 'No season is given its public words by more than one module.' }
    const named = clashes.map(c => `${c.season} (${c.contributors.join(', ')})`).join('; ')
    return { state: 'warning', sentence: `More than one module gives public words to ${named}. The first listed is used.`, remedy: 'Switch one of them off for that season, so the words are the ones you mean.' }
  },
} satisfies HealthCheck
