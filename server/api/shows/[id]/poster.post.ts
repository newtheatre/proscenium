import { shows } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { blob } from 'hub:blob'
import { updateShow } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, updateShow)

  const show = await db.select().from(shows).where(eq(shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const form = await readMultipartFormData(event)
  if (!form || form.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' })
  }

  const file = form.find(item => item.name === 'poster')
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: 'No poster file provided (field name: poster)' })
  }

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!file.type || !allowedTypes.includes(file.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed' })
  }

  const maxSize = 5 * 1024 * 1024 // 5MB
  if (file.data.length > maxSize) {
    throw createError({ statusCode: 400, statusMessage: 'File size exceeds 5MB limit' })
  }

  // Delete existing poster if present
  if (show.posterUrl) {
    try {
      await blob.delete(show.posterUrl)
    }
    catch (err) {
      console.error('Failed to delete old poster:', err)
    }
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const blobResult = await blob.put(`shows/${showId}/poster-${Date.now()}.${ext}`, file.data, {
    contentType: file.type,
    access: 'public',
  })

  const [updated] = await db.update(shows)
    .set({ posterUrl: blobResult.pathname })
    .where(eq(shows.id, showId))
    .returning()

  return updated
})
