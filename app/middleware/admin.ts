import { isAdminOrManager } from '~~/shared/utils/abilities'

// ADMIN/MANAGER pages. Roles ride in the sealed estate cookie, so a session
// older than the staleness window bounces through the auth service's refresh
// (re-reads roles; rejects revoked/disabled users) before being honoured.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user, session } = useUserSession()
  const config = useRuntimeConfig()
  const target = `${useRequestURL().origin}${to.fullPath}`

  if (!loggedIn.value) {
    if (import.meta.dev) {
      return navigateTo('/dev-login?staff=admin', { external: true })
    }
    return navigateTo(
      `${config.public.authBaseURL}/login?redirect=${encodeURIComponent(target)}`,
      { external: true },
    )
  }

  if (!import.meta.dev && isStale(session.value)) {
    return navigateTo(
      `${config.public.authBaseURL}/api/session/refresh?redirect=${encodeURIComponent(target)}`,
      { external: true },
    )
  }

  if (!user.value || !isAdminOrManager(user.value)) {
    return navigateTo('/')
  }
})
