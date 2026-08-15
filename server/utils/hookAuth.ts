/**
 * The bearer is the SHA-256 of this app's own service token, compared
 * constant-time. No plaintext travels, and the hash cannot be replayed.
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
