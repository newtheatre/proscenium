// Rendering convenience only: the server guard is what actually refuses, so this saves a signed-out
// visitor from a screen that would have nothing on it (docs/architecture.md).
export default defineNuxtRouteMiddleware(async (to) => {
  const { account, refresh } = useAccount()
  if (import.meta.client && !account.value.signedIn) await refresh()
  if (!account.value.signedIn) return navigateTo(`/sign-in?next=${encodeURIComponent(to.fullPath)}`)
})
