// The access scheme as a requirement source (ID-43): core.access-scheme:companions is met, with a
// quantity of one or two, for a person on the scheme with companions accepted (and verified, when
// core.access-scheme.companions-need-verified is on), and not met at nought. At checkout it is asked
// for the person's own session, so nobody else learns the answer. Asking about somebody else needs
// checkAbility, which the kit checks and audits.
import { defineRequirementSource, type SourceAnswer } from '#kit'
import { companionsFor } from '../../identity/access-scheme'

const REF = 'core.access-scheme:companions'
const LABEL = 'Companions on the access scheme'

export default defineRequirementSource({
  // Box office's purpose ability, box-office.order.view-access-note, takes this place once box office
  // declares it; until then, identity's own reading ability.
  checkAbility: 'core.access-profile.read',
  options: async query => [{ reference: REF, label: LABEL }].filter(o => o.label.toLowerCase().includes(query.toLowerCase())),
  describe: async refs => Object.fromEntries(refs.filter(r => r === REF).map(ref => [ref, { label: LABEL }])),
  async check(accounts, refs) {
    const out: SourceAnswer[] = []
    for (const ref of refs) {
      for (const account of accounts) {
        const companions = ref === REF && account ? await companionsFor(account) : 0
        out.push(companions > 0
          ? { account, ref, verdict: 'met', quantity: companions }
          : { account, ref, verdict: 'not-met', reason: 'Companion tickets are for people on the theatre\'s access scheme.', help: '/account' })
      }
    }
    return out
  },
})
