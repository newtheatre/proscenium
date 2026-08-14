import { blob } from '@nuxthub/blob'

/**
 * Allowed MIME types for image uploads.
 */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * Maximum file size for image uploads (5 MB).
 */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024

interface ImageUploadOptions {
  /** The multipart field name to look for (e.g. 'poster', 'image'). */
  fieldName: string
  /** Blob storage path prefix (e.g. 'shows/abc123'). The final filename is auto-generated. */
  pathPrefix: string
  /** Existing blob pathname to delete before uploading the replacement. */
  existingPath?: string | null
}

interface ImageUploadResult {
  /** The stored blob pathname (use this to persist in the DB). */
  pathname: string
}

/**
 * Validate and upload an image from multipart form data to blob storage.
 * JPEG, PNG or WebP, 5 MB maximum. Replaces and deletes any previous image.
 * Returns the blob pathname.
 */
export async function validateAndUploadImage(
  event: Parameters<typeof readMultipartFormData>[0],
  opts: ImageUploadOptions,
): Promise<ImageUploadResult> {
  const form = await readMultipartFormData(event)
  if (!form || form.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' })
  }

  const file = form.find(item => item.name === opts.fieldName)
  if (!file || !file.data) {
    throw createError({ statusCode: 400, statusMessage: `No file provided (field name: ${opts.fieldName})` })
  }

  if (!file.type || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed' })
  }

  if (file.data.length > MAX_IMAGE_SIZE) {
    throw createError({ statusCode: 400, statusMessage: 'File size exceeds 5MB limit' })
  }

  // Delete existing image if present
  if (opts.existingPath) {
    try {
      await blob.delete(opts.existingPath)
    }
    catch (err) {
      console.error('Failed to delete old image:', err)
    }
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const blobResult = await blob.put(`${opts.pathPrefix}/image-${Date.now()}.${ext}`, file.data, {
    contentType: file.type,
    access: 'public',
  })

  return { pathname: blobResult.pathname }
}
