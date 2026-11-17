// A venue's public page (part 6; C-48): address, map link, getting here, each performance space's
// finding-it note, access features, and what is on there now. "Not found" for an archived venue.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { currentProductions, publicVenue } from '#modules/core'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true }) ?? ''
  const venue = await publicVenue(slug)
  if (!venue) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return { venue, productions: await currentProductions({ venue: venue.slug }) }
})
