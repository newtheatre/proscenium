import { sessionFacts } from '#shared/utils/viewer-facts'

// Who the caller is and what they hold, re-read from the account rather than from the cookie
// (0007, 0009). The permissions are what the chrome filters itself by; guards refuse regardless.
export default defineEventHandler(async (event) => {
  const account = await currentAccount(event)
  if (!account) return { signedIn: false as const }

  return {
    signedIn: true as const,
    user: { id: account.id, name: account.name, email: account.email, verified: account.verified },
    ...sessionFacts(await viewerFacts(event, account.id)),
  }
})
