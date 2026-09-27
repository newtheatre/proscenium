// This account's own inbox, newest first: everything a preference could have silenced by email
// still lands here (H-102 criterion 6, issue 1345).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return { items: await recentInbox(account.id, 50) }
})
