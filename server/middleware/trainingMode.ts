/**
 * While a sandbox is open, this user may not write anything real (ADR-0032).
 * Belt and braces: training requests already go to their own handlers.
 */

import type { H3Event } from 'h3'

/** The subtrees a run must not write to. Reads are left alone. */
const OPERATIONAL = /^\/api\/(bar|foh)\//
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler(async (event: H3Event) => {
  const path = event.path ?? ''
  if (!MUTATING.has(event.method)) return
  if (!OPERATIONAL.test(path)) return
  // The sandbox's own routes live under /api/training and are never blocked.
  if (path.startsWith('/api/training/')) return

  const session = await getUserSession(event)
  const userId = session.user?.id
  if (!userId) return

  const run = await activeRun(userId)
  if (!run) return

  throw createError({
    statusCode: 409,
    statusMessage: 'You are in practice mode. End practice before doing anything for real.',
  })
})
