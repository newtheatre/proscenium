// Decline a declaration: the evidence did not check out, or the officer could not verify it.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'access.verify')
  const userId = getRouterParam(event, 'userId') ?? ''

  await declineAccessProfile(event, userId, resolved.account.id)

  return { ok: true }
})
