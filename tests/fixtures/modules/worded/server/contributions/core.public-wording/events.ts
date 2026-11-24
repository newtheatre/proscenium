import type { PublicWording } from '#modules/core'
import { worded } from '../../state'

export default {
  async appliesTo(seasonId) {
    if (worded.failing) throw new Error('worded.events is failing')
    return worded.events.has(seasonId)
  },
  terms: { production: 'worded.event', productions: 'worded.events' },
} satisfies PublicWording
