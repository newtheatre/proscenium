// Who the caller is and what they hold, re-read from the account rather than from the cookie
// (0007, 0009). The permissions are what the chrome filters itself by; guards refuse regardless.
export default defineEventHandler(async (event) => {
  const account = await currentAccount(event)
  if (!account) return { signedIn: false as const }

  const grants = await liveGrants(account.id)
  return {
    signedIn: true as const,
    user: { id: account.id, name: account.name, email: account.email, verified: account.verified },
    permissions: [...permissionsFor(grants, new Date())].sort(),
    // Derived authority, so none of it can come from a grant. A shift is always false until the
    // rota exists (E-102, E-104); the show-night routes check tonight themselves either way.
    onShiftTonight: false,
    leadsDepartment: (await liveLeads(account.id)).length > 0,
    isTrainer: (await trainerStandingOf(account.id, londonToday())).trainer,
  }
})
