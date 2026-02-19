import { venues } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { blob } from 'hub:blob'
import { updateVenue } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'id')

  if (!venueId) {
    throw createError({ statusCode: 400, statusMessage: 'Venue ID is required' })
  }

  // Check if user has permission to update venues
  await authorize(event, updateVenue)

  // Get the venue
  const venue = await db.select().from(venues).where(eq(venues.id, venueId)).get()

  if (!venue) {
    throw createError({ statusCode: 404, statusMessage: 'Venue not found' })
  }

  // Parse multipart form data to get the file
  const form = await readMultipartFormData(event)

  if (!form || form.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' })
  }

  const file = form.find(item => item.name === 'image')

  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'No image file provided' })
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!file.type || !allowedTypes.includes(file.type)) {
    throw createError({ 
      statusCode: 400, 
      statusMessage: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed' 
    })
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024 // 5MB in bytes
  if (file.data.length > maxSize) {
    throw createError({ statusCode: 400, statusMessage: 'File size exceeds 5MB limit' })
  }

  // Delete old image if it exists
  if (venue.imageUrl) {
    try {
      await blob.delete(venue.imageUrl)
    }
    catch (error) {
      console.error('Failed to delete old venue image:', error)
      // Continue with upload even if old image deletion fails
    }
  }

  // Generate a unique filename
  const extension = file.filename?.split('.').pop() || 'jpg'
  const blobPath = `venues/${venueId}/${Date.now()}.${extension}`

  // Upload to NuxtHub blob storage (Cloudflare R2)
  const uploadedBlob = await blob.put(blobPath, file.data, {
    contentType: file.type,
  })

  // Update venue with new image URL
  await db.update(venues)
    .set({ imageUrl: uploadedBlob.pathname })
    .where(eq(venues.id, venueId))

  return {
    success: true,
    imageUrl: uploadedBlob.pathname,
    message: 'Image uploaded successfully',
  }
})
