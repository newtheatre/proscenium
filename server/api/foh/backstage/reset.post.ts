import { db, schema } from '@nuxthub/db'
import { workFoh } from '~~/shared/utils/abilities'

/**
 * POST /api/foh/backstage/reset: the kill switch. Every joined device is out
 * instantly and a new code appears (ADR-0020).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const performance = scope.performances[0]
  if (!performance) {
    throw createError({ statusCode: 404, statusMessage: 'You are not working tonight.' })
  }

  const night = await resetCode(scope.night, user.id)

  // Audited and announced, so it stays free to use liberally (ADR-0020).
  await db.insert(schema.incidentLog).values({
    performanceId: performance.id,
    authorUserId: user.id,
    body: 'Backstage code reset. Every joined device was signed out and a new code issued.',
  })

  event.waitUntil(sendBackstageResetEmail({
    night: night.night,
    resetBy: user.name,
    showTitle: performance.showTitle,
  }).catch(error => console.error('[backstage] reset notice failed:', error)))

  return {
    night: night.night,
    code: await deriveCode(night.night, night.epoch),
    expiresAt: night.expiresAt,
    devices: [],
  }
})
