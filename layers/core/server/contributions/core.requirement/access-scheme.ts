// The access scheme as a requirement source (ID-43). core.access-scheme:companions is met, with a
// quantity of one or two, for a person on the scheme with companions accepted (and verified, when
// core.access-scheme.companions-need-verified is on), and not met at nought. Like the wheelchair
// space, companions asked for in an application still waiting are met, flagged "pending".
// core.access-scheme:wheelchair is met for a person whose application says they stay in their
// wheelchair: accepted, or still waiting to be decided (Matt, 2026-11-17), when the answer says so
// for staff and carries the evidence "pending" so the booking can be flagged until it is decided.
// core.access-scheme:seat is the ordinary access ticket's (Matt, 2026-11-18): met in the same way for
// everyone else on the scheme, so each person sees only the ticket that fits them. A not-met answer
// with no reason means "not for this person": the booking page leaves the ticket out rather than
// inviting them to qualify. Someone not on the scheme is invited only to the wheelchair space.
// At checkout it is asked for the person's own session, so nobody else learns the answer. Asking
// about somebody else needs checkAbility, which the kit checks and audits.
import { defineRequirementSource, type SourceAnswer } from '#kit'
import { accessSeatFor, companionsFor, companionsPending, wheelchairFor } from '../../identity/access-scheme'

const COMPANIONS = 'core.access-scheme:companions'
const WHEELCHAIR = 'core.access-scheme:wheelchair'
const SEAT = 'core.access-scheme:seat'
const LABELS: Record<string, string> = { [COMPANIONS]: 'Companions on the access scheme', [WHEELCHAIR]: 'Wheelchair users on the access scheme', [SEAT]: 'People on the access scheme who need a seat' }

async function answer(account: string | null, ref: string): Promise<SourceAnswer> {
  if (ref === COMPANIONS) {
    const companions = account ? await companionsFor(account) : 0
    if (companions > 0) return { account, ref, verdict: 'met', quantity: companions }
    const waiting = account ? await companionsPending(account) : 0
    return waiting > 0
      ? { account, ref, verdict: 'met', quantity: waiting, summary: 'Access scheme application not decided yet.', evidence: 'pending' }
      : { account, ref, verdict: 'not-met', reason: 'Companion tickets are for people on the theatre\'s access scheme.', help: '/account' }
  }
  if (ref === SEAT) {
    const seat = account ? await accessSeatFor(account) : null
    if (seat === 'accepted') return { account, ref, verdict: 'met' }
    if (seat === 'submitted') return { account, ref, verdict: 'met', summary: 'Access scheme application not decided yet.', evidence: 'pending' }
    return { account, ref, verdict: 'not-met', summary: 'Not on the access scheme, or needs a wheelchair space.' }
  }
  const wheelchair = account && ref === WHEELCHAIR ? await wheelchairFor(account) : null
  if (wheelchair === 'accepted') return { account, ref, verdict: 'met' }
  if (wheelchair === 'submitted') return { account, ref, verdict: 'met', summary: 'Access scheme application not decided yet.', evidence: 'pending' }
  // Someone on the scheme who needs no wheelchair space has the access ticket instead.
  if (account && ref === WHEELCHAIR && await accessSeatFor(account)) return { account, ref, verdict: 'not-met', summary: 'On the access scheme without a wheelchair space.' }
  return { account, ref, verdict: 'not-met', reason: 'Need a wheelchair space? Apply to the access scheme.', help: '/account/access/apply' }
}

export default defineRequirementSource({
  // Box office's purpose ability, box-office.order.view-access-note, takes this place once box office
  // declares it; until then, identity's own reading ability.
  checkAbility: 'core.access-profile.read',
  options: async query => Object.entries(LABELS).map(([reference, label]) => ({ reference, label })).filter(o => o.label.toLowerCase().includes(query.toLowerCase())),
  describe: async refs => Object.fromEntries(refs.filter(r => r in LABELS).map(ref => [ref, { label: LABELS[ref]! }])),
  async check(accounts, refs) {
    const out: SourceAnswer[] = []
    for (const ref of refs) {
      for (const account of accounts) out.push(await answer(account, ref))
    }
    return out
  },
})
