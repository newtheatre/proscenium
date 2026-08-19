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
  /** Best-effort removal of the replaced image. Call once the row is updated. */
  deletePrevious: () => Promise<void>
}

/**
 * Validate and upload an image to blob storage: JPEG, PNG or WebP, 5 MB max.
 * Returns the pathname plus a cleanup to run after the row is repointed.
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

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const blobResult = await blob.put(`${opts.pathPrefix}/image-${Date.now()}.${ext}`, file.data, {
    contentType: file.type,
    access: 'public',
  })

  // Removed only once the caller has repointed the row: deleting first leaves the
  // row addressing a blob that no longer exists if the upload or update fails.
  const previous = opts.existingPath
  return {
    pathname: blobResult.pathname,
    deletePrevious: async () => {
      if (!previous || previous === blobResult.pathname) return
      try {
        await blob.delete(previous)
      }
      catch (err) {
        console.error('Failed to delete old image:', err)
      }
    },
  }
}
