// One production for its public page (C-39), with its dates, access, advisories, public credits and
// the booking action for each date. An old address answers with the current one (C-46). A past show
// answers "not found" while past shows are not public (C-47).
import { getRouterParam } from 'h3'
import { defineRoute, refuse, useSetting } from '#kit'
import { productionPublicLines, publicProduction } from '#modules/core'
import { productionBase, sectionsFor } from '../../../shape'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true }) ?? ''
  const production = await publicProduction(slug, { cancelledVisible: await useSetting('public-site.listing.cancelled-visible') as boolean })
  if (!production || ('past' in production && production.past && !await useSetting('public-site.archive.public'))) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  if ('moved' in production) return production
  // Other modules' parts of the page (C-69, C-75), and the address it lives at while one moves it (C-73).
  const [sections, lines, base] = await Promise.all([sectionsFor('public-site.production-section', production.id), productionPublicLines(production.id), productionBase()])
  return { ...production, sections, lines, base }
})
