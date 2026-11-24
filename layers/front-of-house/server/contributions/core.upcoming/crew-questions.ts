// A crew call whose shifts the person took without answering its questions (FH-49), on My account's
// Upcoming card as waiting now, opening the questions.
import { nowMs } from '#kit'
import type { UpcomingSource } from '#modules/core'
import { unansweredCalls } from '../../crew-calls'

export default {
  async items(actor, limit) {
    if (!actor.accountId) return []
    const calls = (await unansweredCalls(actor.accountId)).slice(0, limit)
    return calls.map(c => ({ id: c.id, at: nowMs(), icon: 'i-lucide-clipboard-list', title: c.name, label: 'front-of-house.upcoming.crew-questions', params: { call: c.name }, to: `/members/front-of-house/crew-calls/${c.id}` }))
  },
} satisfies UpcomingSource
