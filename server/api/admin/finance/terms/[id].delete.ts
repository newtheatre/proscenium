// Takes a mistaken term off the list; a close is never touched, since none references a term (0129).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'finance.write')
  const id = getRouterParam(event, 'id') ?? ''
  if (!(await removeTerm(id, resolved.account.id))) throw noSuch('term')
  return { ok: true }
})
