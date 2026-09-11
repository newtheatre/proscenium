import { blob } from '@nuxthub/blob'
import { POSTER_PREFIX, isPosterKey } from '#shared/utils/seo'

// A show's poster from the blob store. The key is checked decoded, by the same rule that made it a
// public address, so nothing outside posters/ is reachable here (K-125).
export default defineEventHandler(async (event) => {
  const key = `${POSTER_PREFIX}${decodeURIComponent(getRouterParam(event, 'key') ?? '')}`
  if (!isPosterKey(key)) throw createError({ statusCode: 404, statusMessage: 'No such poster' })
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  return blob.serve(event, key)
})
