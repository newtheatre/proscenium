// This account's own notification preferences, every cell of the matrix, and its recent inbox.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)

  return {
    topics: await preferenceMatrix(event, account.id),
    inbox: await recentInbox(account.id),
  }
})
