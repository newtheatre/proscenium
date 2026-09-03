import { LISTED_CACHE_MAX_SECONDS } from '#shared/utils/programme'

// Deliberately public: what is on is how somebody decides to come, and no account is needed (D-101).
export default defineEventHandler(async (event) => {
  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)
  const limited = await configValue(event, 'LISTING_LIMITED_THRESHOLD_PERCENT')
  const listing = await publicListing(limited, page, pageSize)

  // The cache ends at the first booking window this page describes closing, so "booking closed"
  // appears the moment it does rather than at the next refresh (D-112 criterion 4, 0045).
  setResponseHeader(event, 'cache-control', `public, max-age=${listing.cacheSeconds}, s-maxage=${listing.cacheSeconds}`)

  return {
    ...envelope(listing.items, listing.total, page, pageSize),
    cacheSeconds: listing.cacheSeconds,
    cacheMaxSeconds: LISTED_CACHE_MAX_SECONDS,
  }
})
