// A member's own held passes and their own pending requests (D-124 criterion 5), and what may
// still be requested.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const [passes, requests, sellable] = await Promise.all([
    heldPasses(account.id),
    ownPassRequests(account.id),
    sellablePassTypes(),
  ])
  return { passes, requests, sellable }
})
