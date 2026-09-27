// This account's own email preferences, one per topic. The inbox is its own read (issue 1345).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  return { topics: await preferenceMatrix(event, account.id) }
})
