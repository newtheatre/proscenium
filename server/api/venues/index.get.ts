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
  return allVenues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    address: venue.address,
    capacity: venue.capacity,
    imageUrl: venue.imageUrl,
    description: venue.description,
    createdAt: venue.createdAt,
    updatedAt: venue.updatedAt,
    features: venue.venuesToFeatures.map((vtf) => vtf.feature),
  }))
})
