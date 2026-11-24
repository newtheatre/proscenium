// Serves a stored file at /files/<id> (C-23, C-25). Only a ready file is served. Public files are
// cached; anything else answers "not found" to anyone who may not see it, so its existence does not
// leak. An SVG is served with a policy that stops it running anything, even after cleaning.
import { bindings } from '#kit/bindings'
import { defineEventHandler, getHeader, getRouterParam, setResponseHeaders, setResponseStatus } from 'h3'
import { runInContext } from '#kit/context'
import { useAccessProvider } from '#kit/access'
import { first, isId, nowMs, files as store } from '#kit'
import { mayReadRecordFile } from '../../files/service'

export default defineEventHandler(async (event) => {
  const env = bindings(event)
  if (!env?.DB) throw new Error('No DB binding on this request')
  return runInContext({ env, requestId: getHeader(event, 'cf-ray') ?? crypto.randomUUID() }, async () => {
    const id = getRouterParam(event, 'id') ?? ''
    const notFound = () => {
      setResponseStatus(event, 404) // not-policy: HTTP status
      setResponseHeaders(event, { 'cache-control': 'no-store' })
      return 'Not found'
    }
    if (!isId('fil', id)) return notFound()
    const row = await first<{ object_key: string, media_type: string, access: string, sha256: string, byte_size: number, slot: string, owner_type: string, owner_id: string, expires_at: number | null }>(
      "SELECT object_key, media_type, access, sha256, byte_size, slot, owner_type, owner_id, expires_at FROM core_files WHERE id = ? AND state = 'ready'", id,
    )
    if (!row || (row.expires_at !== null && row.expires_at <= nowMs())) return notFound()
    if (row.access === 'signed_in') {
      const actor = await useAccessProvider().actor(event)
      if (actor.kind !== 'person') return notFound()
    }
    // Record access asks the module that owns the record (point core.file-access).
    else if (row.access === 'record') {
      const actor = await useAccessProvider().actor(event)
      if (actor.kind !== 'person' || !await mayReadRecordFile(actor, { id, ...row })) return notFound()
    }
    else if (row.access !== 'public') return notFound()

    const etag = `"${row.sha256}"`
    const headers: Record<string, string> = {
      'content-type': row.media_type,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'cache-control': row.access === 'public' ? 'public, max-age=31536000, immutable' : row.access === 'record' ? 'private, no-store' : 'private, max-age=300', // not-policy: a ready file never changes under its id
      'etag': etag,
    }
    if (getHeader(event, 'if-none-match') === etag) {
      setResponseStatus(event, 304) // not-policy: HTTP status
      setResponseHeaders(event, headers)
      return null
    }
    const object = await store.get(row.object_key)
    if (!object) return notFound()
    return new Response(object.body, { headers: { ...headers, 'content-length': String(row.byte_size) } })
  })
})
