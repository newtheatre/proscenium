// One production for its public page (C-39), with its dates, access, advisories, public credits and
// the booking action for each date. An old address answers with the current one (C-46). A past show
// answers "not found" while past shows are not public (C-47).
import { getRouterParam } from 'nuxt/server'
import { defineRoute, refuse, useSetting } from '#kit'
import { publicProduction } from '#modules/core'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true }) ?? ''
  const production = await publicProduction(slug, { cancelledVisible: await useSetting('public-site.listing.cancelled-visible') as boolean })
  if (!production || ('past' in production && production.past && !await useSetting('public-site.archive.public'))) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return production
})
