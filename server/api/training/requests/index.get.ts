// What a member has asked for, and what came back. Newest first.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const items = await requestsBy(account.id)
  return { items, total: items.length }
})
