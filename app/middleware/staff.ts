import { isStale } from '@newtheatre/auth-types'
import { isStaff } from '~~/shared/utils/abilities'

// Staff pages (ADMIN, MANAGER, BOX_OFFICE): same staleness rule as admin.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user, session } = useUserSession()
  const config = useRuntimeConfig()
  const target = `${useRequestURL().origin}${to.fullPath}`

  if (!loggedIn.value) {
    if (import.meta.dev) {
      return navigateTo('/dev-login?staff=box-office', { external: true })
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

  if (!user.value || !isStaff(user.value)) {
    return navigateTo('/')
  }
})
