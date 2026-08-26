// Who the caller is, re-read from the account rather than from the cookie (0007).
export default defineEventHandler(async (event) => {
  const account = await currentAccount(event)
  if (!account) return { signedIn: false as const }
  return {
    signedIn: true as const,
    user: { id: account.id, name: account.name, email: account.email, verified: account.verified },
  }
})
