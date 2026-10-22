// Asked as the refund sheet opens, so a stale session re-asserts before any money leaves the
// reader rather than after (0171). The refund route checks the same again.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  await requireRefundApproval(event, resolved)
  await requireFreshSession(event)
  return { ready: true as const }
})
