// A fixture source for core.requirement: "is a member", judged from a fixed list, with a membership
// number a person may type at the box office instead of signing in.
import { defineRequirementSource, type SourceAnswer } from '#kit'

export const members = new Set<string>()
export const calls: { accounts: (string | null)[], refs: string[], presented?: unknown[] }[] = []
const NUMBER = '12345678'
const EVIDENCE = 'ev_member'

export default defineRequirementSource({
  checkAbility: 'seats.members.look-up',
  holderAbility: 'seats.members.look-up',
  options: async query => [{ reference: 'seats:member', label: 'A current member' }].filter(o => o.label.toLowerCase().includes(query.toLowerCase())),
  describe: async refs => Object.fromEntries(refs.map(ref => [ref, { label: 'A current member', presentable: { label: 'Membership number', shape: 'digits-8' } }])),
  async check(accounts, refs, _at, _record, presented) {
    calls.push({ accounts, refs, presented })
    const out: SourceAnswer[] = []
    for (const ref of refs) {
      if (ref === 'seats:broken') throw new Error('The membership list did not answer')
      for (const account of accounts) {
        if (account && members.has(account)) {
          out.push({ account, ref, verdict: 'met', quantity: 2, summary: 'Member: current' })
          continue
        }
        const offered = presented?.find(p => p.ref === ref)
        const accepted = offered && ('value' in offered ? offered.value === NUMBER : offered.evidence === EVIDENCE)
        out.push(accepted ? { account, ref, verdict: 'met', evidence: EVIDENCE } : { account, ref, verdict: 'not-met', reason: 'We could not find that membership.', quantity: 5 })
      }
    }
    return out
  },
  holder: async evidence => evidence === EVIDENCE ? 'A. Member' : null,
})
