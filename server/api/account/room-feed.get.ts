// Whether this account has a calendar feed, and where it is.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return { exists: await feedTokenExists(account.id) }
})
