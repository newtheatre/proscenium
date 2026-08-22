/**
 * DEV ONLY: the one sanctioned exception to "apps never write the session".
 * Guarded by import.meta.dev, so it does not exist in production.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const { staff } = getQuery(event)
  // Keyed by the `?staff=` value. A persona per role in the manifest, so a
  // rota-scoped screen can be seen as the person it was built for.
  const PERSONAS: Record<string, string[]> = {
    'admin': ['ADMIN'],
    'manager': ['MANAGER'],
    'box-office': ['BOX_OFFICE'],
    'foh-manager': ['FOH_MANAGER'],
    'front-of-house': ['FRONT_OF_HOUSE'],
    'committee': ['COMMITTEE'],
  }
  const roles = (PERSONAS[String(staff ?? '')] ?? [])
    .map(role => `${APP_MANIFEST.namespace}:${role}`)

  const now = Date.now()

  // replaceUserSession, NOT setUserSession: set merges with defu, which
  // concatenates arrays, so switching persona would keep the old roles.
  await replaceUserSession(event, {
    user: {
      id: `dev-${staff || 'user'}`,
      email: `dev-${staff || 'user'}@proscenium.test`,
      name: `Dev ${staff ? String(staff) : 'User'}`,
      verified: true,
      guest: false,
      roles,
    },
    loggedInAt: now,
    refreshedAt: now,
    epoch: 0,
  })

  return sendRedirect(event, '/', 302)
})
