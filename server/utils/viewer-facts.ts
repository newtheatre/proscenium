import { londonDay, membershipState } from '#shared/utils/membership'
import type { ViewerFacts } from '#shared/utils/viewer-facts'
import type { H3Event } from 'h3'

// Read live from the account on every call, never held: a handler that changes one of these and
// then asks again must see the change, and derived authority is never a grant (0009).
export async function viewerFacts(event: H3Event, accountId: string): Promise<ViewerFacts> {
  const [grants, term, graceDays, onShift, keepsTab, leads, standing] = await Promise.all([
    liveGrants(accountId),
    longestTerm(accountId),
    configValue(event, 'MEMBERSHIP_GRACE_DAYS'),
    onShiftTonight(event, accountId),
    keepsBarTab(event, accountId),
    liveLeads(accountId),
    trainerStandingOf(accountId, londonToday()),
  ])
  return {
    id: accountId,
    permissions: [...permissionsFor(grants, new Date())].sort(),
    holdsRole: grants.length > 0,
    onShiftTonight: onShift,
    leadsDepartment: leads.length > 0,
    isTrainer: standing.trainer,
    keepsBarTab: keepsTab,
    membershipState: membershipState(term, londonDay(new Date()), graceDays),
  }
}
