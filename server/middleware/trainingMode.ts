/**
 * While a sandbox is open, this user reaches nothing operational (ADR-0032).
 * Default-deny, including reads: a practice screen must not show real data.
 */

import type { H3Event } from 'h3'

/** The subtrees a run is sealed off from. */
const OPERATIONAL = /^\/api\/(bar|foh)\//

/**
 * Reads the show-night shell itself needs, which carry no customer or money
 * data. Everything else under the subtrees above is refused.
 */
const SHELL_READS = [
  /^\/api\/foh\/tonight\/?$/,
  /^\/api\/foh\/emergency\/?$/,
  /^\/api\/foh\/contacts\/?$/,
]

export default defineEventHandler(async (event: H3Event) => {
  const path = (event.path ?? '').split('?')[0] ?? ''
  if (!OPERATIONAL.test(path)) return

  const isRead = event.method === 'GET' || event.method === 'HEAD'
  if (isRead && SHELL_READS.some(allowed => allowed.test(path))) return

  const session = await getUserSession(event)
  const userId = session.user?.id
  if (!userId) return

  const run = await activeRun(userId)
  if (!run) return

  throw createError({
    statusCode: 409,
    statusMessage: isRead
      ? 'That is real data, and you are in practice mode.'
      : 'You are in practice mode. End practice before doing anything for real.',
  })
})
