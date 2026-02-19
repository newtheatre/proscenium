export default defineEventHandler(async () => {
  // Features are public - no authentication required

  // Get all venue features
  const allFeatures = await db.query.venueFeatures.findMany({
    orderBy: (venueFeatures, { asc }) => [asc(venueFeatures.name)],
  })

  return allFeatures
})
