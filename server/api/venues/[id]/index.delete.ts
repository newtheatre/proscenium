import { venues } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { blob } from 'hub:blob'
import { deleteVenue } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'id')

  if (!venueId) {
    throw createError({ statusCode: 400, statusMessage: 'Venue ID is required' })
  }

  // Check if user has permission to delete venues
  await authorize(event, deleteVenue)

  // Get the venue
  const venue = await db.select().from(venues).where(eq(venues.id, venueId)).get()

  if (!venue) {
    throw createError({ statusCode: 404, statusMessage: 'Venue not found' })
  }

  // Delete venue image from blob storage if it exists
  if (venue.imageUrl) {
    try {
      await blob.delete(venue.imageUrl)
    }
    catch (error) {
      console.error('Failed to delete venue image from blob storage:', error)
      // Continue with deletion even if blob deletion fails
    }
  }

  // Delete the venue (cascade will delete related records)
  await db.delete(venues).where(eq(venues.id, venueId))

  return { success: true, message: 'Venue deleted successfully' }
})
