// A member's own held passes and their own pending requests (D-124 criterion 5), and what may
// still be requested: each type says whether it is held or already asked for (issue 1331).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const [passes, requests, sellable] = await Promise.all([
    heldPasses(account.id),
    ownPassRequests(account.id),
    sellablePassTypes(),
  ])
  return {
    passes,
    requests,
    sellable: sellable.map(type => ({
      ...type,
      held: passes.some(pass => pass.passTypeId === type.id && pass.status === 'ACTIVE'),
      openRequestId: requests.find(request => request.passTypeId === type.id && request.status === 'PENDING')?.id ?? null,
    })),
  }
})
