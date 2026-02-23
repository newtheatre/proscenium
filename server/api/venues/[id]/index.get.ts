import { db } from '@nuxthub/db'

/** GET /api/venues/:id — get a venue by ID. Public. */
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'id')

  if (!venueId) {
    throw createError({ statusCode: 400, statusMessage: 'Venue ID is required' })
  }

  // Venues are public - no authentication required

  // Get venue with features
  const venue = await db.query.venues.findFirst({
    where: (venuesTable, { eq }) => eq(venuesTable.id, venueId),
    with: {
      venuesToFeatures: {
        with: {
          feature: true,
        },
      },
    },
  })

  if (!venue) {
    throw createError({ statusCode: 404, statusMessage: 'Venue not found' })
  }

  // Map to expected format
  return formatVenueResponse(venue)
})
