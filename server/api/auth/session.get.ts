import { londonDay, membershipState } from '#shared/utils/membership'

// Who the caller is and what they hold, re-read from the account rather than from the cookie
// (0007, 0009). The permissions are what the chrome filters itself by; guards refuse regardless.
export default defineEventHandler(async (event) => {
  const account = await currentAccount(event)
  if (!account) return { signedIn: false as const }

  const [grants, term, graceDays, onShift] = await Promise.all([
    liveGrants(account.id),
    longestTerm(account.id),
    configValue(event, 'MEMBERSHIP_GRACE_DAYS'),
    onShiftTonight(account.id),
  ])
  return {
    signedIn: true as const,
    user: { id: account.id, name: account.name, email: account.email, verified: account.verified },
    permissions: [...permissionsFor(grants, new Date())].sort(),
    // A role may carry no permission at all; the docs tree still counts it as committee (0093).
    holdsRole: grants.length > 0,
    // Derived authority, so none of it can come from a grant (0009).
    onShiftTonight: onShift,
    leadsDepartment: (await liveLeads(account.id)).length > 0,
    isTrainer: (await trainerStandingOf(account.id, londonToday())).trainer,
    membershipState: membershipState(term, londonDay(new Date()), graceDays),
  }
})
