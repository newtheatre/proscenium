/**
 * Auth for the GDPR hooks the central auth service calls
 * (stage-door docs/api-reference.md#app-hooks).
 *
 * The bearer is the SHA-256 of this app's own service token: the auth
 * service sends the hash it stores; we derive the same hash from our
 * AUTH_SERVICE_TOKEN secret and compare constant-time. No plaintext ever
 * travels, and the hash can't be replayed inbound against the auth service.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

export function requireHookAuth(event: H3Event): void {
  const token = useRuntimeConfig(event).authServiceToken
  const authorization = getRequestHeader(event, 'authorization')

  if (token && authorization?.startsWith('Bearer ')) {
    const expected = Buffer.from(createHash('sha256').update(token).digest('hex'))
    const presented = Buffer.from(authorization.slice('Bearer '.length))
    if (expected.length === presented.length && timingSafeEqual(expected, presented)) {
      return
    }
  }

  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}
