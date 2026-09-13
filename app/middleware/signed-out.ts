// The mirror of `signed-in`: a visitor who already has a session has nothing to do on the way in,
// and a second set of details typed here would be a second account by mistake.
export default defineNuxtRouteMiddleware(async (to) => {
  const { account, refresh } = useAccount()
  if (import.meta.client && !account.value.signedIn) await refresh()
  if (!account.value.signedIn) return

  // Only a path on this site: an absolute URL would make the way in an open redirect.
  const next = to.query.next
  return navigateTo(typeof next === 'string' && /^\/(?!\/)/.test(next) ? next : '/')
})
