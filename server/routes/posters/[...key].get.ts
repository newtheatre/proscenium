import { blob } from '@nuxthub/blob'
import { POSTER_PREFIX } from '#shared/utils/seo'

// A show's poster from the blob store. Only keys under posters/ are reachable here (K-125).
export default defineEventHandler(async (event) => {
  const key = getRouterParam(event, 'key') ?? ''
  if (!key || key.split('/').includes('..')) throw createError({ statusCode: 404, statusMessage: 'No such poster' })
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  return blob.serve(event, `${POSTER_PREFIX}${key}`)
})
