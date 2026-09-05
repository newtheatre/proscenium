// One declaration in full: every flag, both notes, and the self-declared card number if it has
// not yet been sighted. The accessibility officer's own view, never any other staff surface.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'access.verify')
  const userId = getRouterParam(event, 'userId') ?? ''

  const profile = await accessProfileForOfficer(userId)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'No such access profile' })

  return { profile }
})
