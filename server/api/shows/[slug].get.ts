import { z } from 'zod'
import { MAX_SHOW_SLUG, listingCacheSeconds } from '#shared/utils/programme'

const address = z.string().trim().min(1).max(MAX_SHOW_SLUG)

// Deliberately public: one show's page, warnings and practical details included (D-101, D-102).
export default defineEventHandler(async (event) => {
  const slug = address.safeParse(getRouterParam(event, 'slug') ?? '')
  // A draft show and an address nobody holds answer the same way, so the listing cannot be read
  // backwards for what the committee has not published yet (D-101 criterion 1).
  if (!slug.success) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const limited = await configValue(event, 'LISTING_LIMITED_THRESHOLD_PERCENT')
  const show = await publicShowBySlug(limited, slug.data)
  if (!show) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const cacheSeconds = listingCacheSeconds(show.performances.map(one => one.bookingClosesAt))
  setResponseHeader(event, 'cache-control', `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`)

  return { ...show, cacheSeconds }
})
