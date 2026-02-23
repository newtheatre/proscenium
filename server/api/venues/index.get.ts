import { db } from '@nuxthub/db'

/** GET /api/venues — list all venues. Public. */
export default defineEventHandler(async () => {
  // Venues are public - no authentication required

  // Get all venues with their features
  const allVenues = await db.query.venues.findMany({
    with: {
      venuesToFeatures: {
        with: {
          feature: true,
        },
      },
    },
    orderBy: (venues, { asc }) => [asc(venues.name)],
  })

  // Map to expected format with features array
  return allVenues.map(formatVenueResponse)
})
