// Open schemes that could not be opened today (tab 4, core.health-check): a list or its key gone, a
// domain check with no domain, the members' area switched off, or a fee with no price or no fees
// module. People may be unable to join them.
import { listSchemes, openChecklist } from '../../schemes'
import { schemeList } from '../../lists'
import { todayOrNull } from '../../memberships'

export default {
  async check() {
    const broken: string[] = []
    const outdated: string[] = []
    const day = await todayOrNull()
    for (const scheme of await listSchemes(['open'])) {
      if ((await openChecklist(scheme)).some(item => !item.done && item.code !== 'application-form')) broken.push(scheme.name)
      const list = await schemeList(scheme)
      if (day && list?.validUntil && list.validUntil < day) outdated.push(scheme.name)
    }
    if (broken.length) return { state: 'failing' as const, sentence: `Somebody may be unable to join ${broken.join(', ')}: something the scheme needs is missing.`, remedy: 'Open the scheme under Membership, Schemes to see what it needs.' }
    if (outdated.length) return { state: 'warning' as const, sentence: `${outdated.join(', ')} still checks members against a list past its date.`, remedy: 'Upload this year\'s list under Membership, Verification lists.' }
    return { state: 'ok' as const, sentence: 'Every open membership scheme has what it needs.' }
  },
}
