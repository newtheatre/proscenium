import { londonDay, membershipState } from '#shared/utils/membership'
import type { ViewerFacts } from '#shared/utils/viewer-facts'
import type { H3Event } from 'h3'

declare module 'h3' {
  interface H3EventContext {
    viewerFacts?: { accountId: string, facts: Promise<ViewerFacts> }
  }
}

// Read once per request: an ability checked several times asks for the viewer each time, and
// derived authority is read live from the account, never from a grant (0009).
export function viewerFacts(event: H3Event, accountId: string): Promise<ViewerFacts> {
  const held = event.context.viewerFacts
  if (held?.accountId === accountId) return held.facts
  const facts = readViewerFacts(event, accountId)
  event.context.viewerFacts = { accountId, facts }
  return facts
}

async function readViewerFacts(event: H3Event, accountId: string): Promise<ViewerFacts> {
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
