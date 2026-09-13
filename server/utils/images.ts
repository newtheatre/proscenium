import { blob } from '@nuxthub/blob'
import { imageRefusal, posterKeyFor } from '#shared/utils/programme'

// Artwork into the blob store (D-132 criterion 6). What may be uploaded is decided in
// `shared/utils/programme.ts`, so the card offers exactly what this route will take.

export interface StoredImage {
  key: string
  // Run once the row points at the new key: deleting first would leave the row addressing a blob
  // that no longer exists if the write fails.
  forgetPrevious: () => Promise<void>
}

// Read one image out of a multipart body and store it. The caller repoints its row and then calls
// `forgetPrevious`, which is the only order in which a failure leaves the show with its old art.
export async function storePosterImage(
  event: Parameters<typeof readMultipartFormData>[0],
  options: { showId: string, fieldName: string, previousKey: string | null },
): Promise<StoredImage> {
  const form = await readMultipartFormData(event)
  const file = form?.find(part => part.name === options.fieldName && part.data.length > 0)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'No poster was attached to that request' })

  const refusal = imageRefusal(file.type ?? '', file.data.length)
  if (refusal) throw createError({ statusCode: 400, statusMessage: refusal })

  const key = posterKeyFor(options.showId, file.type ?? '')
  await blob.put(key, file.data, { contentType: file.type, access: 'public' })

  const previous = options.previousKey
  return {
    key,
    forgetPrevious: async () => {
      if (!previous || previous === key) return
      await forgetImage(previous)
    },
  }
}

// A blob the row no longer points at is unreachable whether or not the store forgets it, so a
// failure here is recorded and never fails the request that has already succeeded.
export async function forgetImage(key: string): Promise<void> {
  try {
    await blob.delete(key)
  }
  catch (failed) {
    console.error('An old image could not be deleted', key, failed)
  }
}
