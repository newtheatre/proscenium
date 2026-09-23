import { z } from 'zod'
import { LISTED_CACHE_MAX_SECONDS } from '#shared/utils/programme'

// A venue by its name, which is what the page shows and what the listing already carries; a name
// nobody holds lists nothing rather than everything.
const listingQuery = pageQuery.extend({ venue: z.string().trim().max(120).optional() })

// Deliberately public: what is on is how somebody decides to come, and no account is needed (D-101).
export default defineEventHandler(async (event) => {
  const { page, pageSize, venue } = await getValidatedQueryOrThrow(event, listingQuery)
  const limited = await configValue(event, 'LISTING_LIMITED_THRESHOLD_PERCENT')
  const now = new Date()
  const [listing, season] = await Promise.all([
    publicListing(limited, page, pageSize, now, venue || null),
    headlineSeason(now),
  ])

  // The cache ends at the first booking window this page describes closing, so "booking closed"
  // appears the moment it does rather than at the next refresh (D-112 criterion 4, 0045).
  setResponseHeader(event, 'cache-control', `public, max-age=${listing.cacheSeconds}, s-maxage=${listing.cacheSeconds}`)

  return {
    ...envelope(listing.items, listing.total, page, pageSize),
    cacheSeconds: listing.cacheSeconds,
    cacheMaxSeconds: LISTED_CACHE_MAX_SECONDS,
    season,
  }
})
