/**
 * DEV ONLY — the single sanctioned exception to "apps never write the
 * session" (stage-door docs/development.md §localhost-cookie-story).
 *
 * GET /dev-login seals a local session so app work needs no running auth
 * service. `?staff=admin|manager|box-office` grants the matching scoped
 * role. Guarded by import.meta.dev — absent from production builds.
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

  // replaceUserSession, NOT setUserSession: the latter merges into whatever
  // session already exists, and defu concatenates arrays — so switching
  // ?staff= swapped the id while keeping the previous tier's role. Cycling
  // admin → manager → box-office accumulated all three, and local
  // authorisation testing quietly ran with more authority than asked for.
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
