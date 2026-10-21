// Rendering convenience only: the server guard is what refuses (docs/architecture.md). A session
// read that fails is no signal rather than a sign-out, so the screen still draws its cached copy.
export default defineNuxtRouteMiddleware(async (to) => {
  const { account, refresh } = useAccount()
  if (account.value.signedIn) return
  if (import.meta.client) {
    try {
      await refresh()
    }
    catch {
      return
    }
  }
  if (!account.value.signedIn) return navigateTo(`/sign-in?next=${encodeURIComponent(to.fullPath)}`)
})
