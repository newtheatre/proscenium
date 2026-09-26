import { londonDay, membershipState } from '#shared/utils/membership'
import { worksTonight } from '#shared/utils/night-authority'

// Who the caller is and what they hold, re-read from the account rather than from the cookie
// (0007, 0009). The permissions are what the chrome filters itself by; guards refuse regardless.
export default defineEventHandler(async (event) => {
  const account = await currentAccount(event)
  if (!account) return { signedIn: false as const }

  const [grants, term, graceDays, onShift, keepsTab] = await Promise.all([
    liveGrants(account.id),
    longestTerm(account.id),
    configValue(event, 'MEMBERSHIP_GRACE_DAYS'),
    onShiftTonight(event, account.id),
    keepsBarTab(event, account.id),
  ])
  const permissions = [...permissionsFor(grants, new Date())].sort()
  return {
    signedIn: true as const,
    user: { id: account.id, name: account.name, email: account.email, verified: account.verified },
    permissions,
    // A role may carry no permission at all; the docs tree still counts it as committee (0093).
    holdsRole: grants.length > 0,
    // Derived authority, so none of it can come from a grant (0009). The one fact every screen
    // reads: the on-shift bar the first, every Tonight link the second (0094).
    onShiftTonight: onShift,
    canWorkTonight: worksTonight({ onShiftTonight: onShift, permissions }),
    leadsDepartment: (await liveLeads(account.id)).length > 0,
    isTrainer: (await trainerStandingOf(account.id, londonToday())).trainer,
    keepsBarTab: keepsTab,
    membershipState: membershipState(term, londonDay(new Date()), graceDays),
  }
})
