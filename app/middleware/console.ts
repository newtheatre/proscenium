import { entryFor } from '#shared/utils/site-nav'
import { reachConsole } from '#shared/utils/abilities'

// Rendering convenience only: the server guard is what actually refuses (docs/architecture.md).
// The ability comes from the nav declaration, so a deep link and the sidebar cannot disagree.
export default defineNuxtRouteMiddleware(async (to) => {
  const { account, refresh } = useAccount()
  if (import.meta.client && !account.value.signedIn) await refresh()
  if (!account.value.signedIn) return navigateTo(`/sign-in?next=${encodeURIComponent(to.fullPath)}`)

  if (await denies(reachConsole)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
  }

  const entry = entryFor(to.path)
  if (entry && await denies(entry.ability)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
  }
})
