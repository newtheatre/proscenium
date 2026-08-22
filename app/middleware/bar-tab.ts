import { isStale } from '@newtheatre/auth-types'
import { canRunBarTab } from '~~/shared/utils/abilities'

// The bar tab. The stale-session bounce matters more here than elsewhere: a
// COMMITTEE-only user loses every role when the session goes stale (ADR-0008).
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user, session } = useUserSession()
  const config = useRuntimeConfig()
  const target = `${useRequestURL().origin}${to.fullPath}`

  if (!loggedIn.value) {
    if (import.meta.dev) {
      return navigateTo('/dev-login?staff=committee', { external: true })
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

  if (!user.value || !canRunBarTab(user.value)) {
    return navigateTo('/')
  }
})
