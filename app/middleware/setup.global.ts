export default defineNuxtRouteMiddleware((to) => {
  const { user } = useUserSession()

  // Only run for authenticated users
  if (!user.value) {
    return
  }

  // Don't redirect if user hasn't verified email yet
  if (!user.value.emailVerified) {
    return
  }

  // Don't redirect if user has already completed setup
  if (user.value.setupCompleted) {
    return
  }

  // Don't redirect if already on setup page or related auth pages
  const exemptPaths = [
    '/profile/setup',
    '/login',
    '/register',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
    '/api',
  ]

  if (exemptPaths.some(path => to.path.startsWith(path))) {
    return
  }

  // Redirect to setup page
  return navigateTo('/profile/setup')
})
