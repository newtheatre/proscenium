// A season's public page (part 6): a published or archived season and its productions. An archived
// season, and the past shows in any season, answer as past shows do while they are not public (C-47).
import { getRouterParam } from 'h3'
import { defineRoute, refuse, useSetting } from '#kit'
import { publicSeason, publicWordingFor } from '#modules/core'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true }) ?? ''
  const season = await publicSeason(slug, { pastVisible: await useSetting('public-site.archive.public') as boolean })
  if (!season) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  // The season's own words (C-67), such as a festival's "event".
  return { ...season, wording: await publicWordingFor(season.id) }
})
