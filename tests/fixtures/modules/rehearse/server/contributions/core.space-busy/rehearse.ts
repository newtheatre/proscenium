// The fixture's rehearsal calls, set by each test. A call's title shows only to a person.
import type { SpaceBusy, SpaceBusyItem } from '#modules/core'

export const calls: SpaceBusyItem[] = []

export default {
  async busy({ spaceIds, from, to }, actor) {
    return calls.filter(c => spaceIds.includes(c.spaceId) && c.from < to && c.to > from).map(c => ({ ...c, label: actor?.kind === 'person' ? c.label : null }))
  },
} satisfies SpaceBusy
