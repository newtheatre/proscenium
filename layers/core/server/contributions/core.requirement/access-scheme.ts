// The access scheme as a requirement source (ID-43). core.access-scheme:companions is met, with a
// quantity of one or two, for a person on the scheme with companions accepted (and verified, when
// core.access-scheme.companions-need-verified is on), and not met at nought.
// core.access-scheme:wheelchair is met for a person whose application says they stay in their
// wheelchair: accepted, or still waiting to be decided (Matt, 2026-11-17), when the answer says so
// for staff and carries the evidence "pending" so the booking can be flagged until it is decided.
// At checkout it is asked for the person's own session, so nobody else learns the answer. Asking
// about somebody else needs checkAbility, which the kit checks and audits.
import { defineRequirementSource, type SourceAnswer } from '#kit'
import { companionsFor, wheelchairFor } from '../../identity/access-scheme'

const COMPANIONS = 'core.access-scheme:companions'
const WHEELCHAIR = 'core.access-scheme:wheelchair'
const LABELS: Record<string, string> = { [COMPANIONS]: 'Companions on the access scheme', [WHEELCHAIR]: 'Wheelchair users on the access scheme' }

async function answer(account: string | null, ref: string): Promise<SourceAnswer> {
  if (ref === COMPANIONS) {
    const companions = account ? await companionsFor(account) : 0
    return companions > 0
      ? { account, ref, verdict: 'met', quantity: companions }
      : { account, ref, verdict: 'not-met', reason: 'Companion tickets are for people on the theatre\'s access scheme.', help: '/account' }
  }
  const wheelchair = account && ref === WHEELCHAIR ? await wheelchairFor(account) : null
  if (wheelchair === 'accepted') return { account, ref, verdict: 'met' }
  if (wheelchair === 'submitted') return { account, ref, verdict: 'met', summary: 'Access scheme application not decided yet.', evidence: 'pending' }
  return { account, ref, verdict: 'not-met', reason: 'Wheelchair spaces are booked through the theatre\'s access scheme: tell us you use a wheelchair there.', help: '/account/access' }
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
