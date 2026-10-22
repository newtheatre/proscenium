// The address this account signs in with, and one it has asked to move to but not yet confirmed.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return { email: account.email, pending: await pendingEmail(account) }
})
