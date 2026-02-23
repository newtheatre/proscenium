/**
 * Staff middleware
 *
 * Allows access to ADMIN, MANAGER, and BOX_OFFICE roles.
 * Redirects unauthenticated users to /login.
 * Redirects authenticated non-staff users to /.
 */
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, user } = useUserSession()

  if (!loggedIn.value) {
    return navigateTo('/login')
  }

  const isStaff = user.value?.roles?.includes('ADMIN')
    || user.value?.roles?.includes('MANAGER')
    || user.value?.roles?.includes('BOX_OFFICE')

  if (!isStaff) {
    return navigateTo('/')
  }
})
