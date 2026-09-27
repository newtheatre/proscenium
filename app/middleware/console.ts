import { entryFor } from '#shared/utils/site-nav'
import { reachConsole } from '#shared/utils/abilities'
import { rolesThatReach } from '#shared/utils/refusals'

// Rendering convenience only: the server guard is what actually refuses (docs/architecture.md).
// The ability comes from the nav declaration, so a deep link and the sidebar cannot disagree.
export default defineNuxtRouteMiddleware(async (to) => {
  const { account, refresh } = useAccount()
  if (import.meta.client && !account.value.signedIn) await refresh()
  if (!account.value.signedIn) return navigateTo(`/sign-in?next=${encodeURIComponent(to.fullPath)}`)

  // The refusal carries who the screen is for, so the page can name them (issue 1304, K-133).
  const entry = entryFor(to.path)
  if (await denies(reachConsole) || (entry && await denies(entry.ability))) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that', data: { roles: entry ? rolesThatReach(entry.ability) : [] } })
  }
})
