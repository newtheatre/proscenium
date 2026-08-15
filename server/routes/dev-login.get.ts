/**
 * DEV ONLY — the one sanctioned exception to "apps never write the session".
 * Guarded by import.meta.dev, so it does not exist in production.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const { staff } = getQuery(event)
  const roles
    = staff === 'admin'
      ? ['proscenium:ADMIN']
      : staff === 'manager'
        ? ['proscenium:MANAGER']
        : staff === 'box-office'
          ? ['proscenium:BOX_OFFICE']
          : []

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
