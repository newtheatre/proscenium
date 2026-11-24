import type { PublicWording } from '#modules/core'
import { worded } from '../../state'

export default {
  async appliesTo(seasonId) {
    return worded.acts.has(seasonId)
  },
  terms: { production: 'worded.act', performance: 'worded.set' },
} satisfies PublicWording
