import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

/**
 * DELETE /api/account/access — remove my access profile. No questions asked,
 * and the needs data goes; tickets already issued stay valid (docs/12 §2.5).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const existing = await db.select({ id: schema.accessProfiles.id }).from(schema.accessProfiles)
    .where(eq(schema.accessProfiles.userId, user.id)).get()
  if (!existing) return { ok: true }

  // Status kept as a tombstone so a future booking stops offering access
  // types, with every symbol, note and card number cleared.
  const cleared = Object.fromEntries(schema.ACCESS_NEEDS.map(key => [key, false]))
  await db.update(schema.accessProfiles).set({
    ...cleared,
    status: 'WITHDRAWN',
    companions: 0,
    accessCardNumber: null,
    requesterNote: null,
    fohNote: null,
    consentFohAt: null,
    verifiedByUserId: null,
    verifiedAt: null,
    expiresAt: null,
  }).where(eq(schema.accessProfiles.userId, user.id))

  return { ok: true }
})
