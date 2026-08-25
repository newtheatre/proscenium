import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ userId: z.string().min(1) })

/**
 * POST /api/_hooks/auth/anonymise: GDPR erasure, this app's share (stage-
 * door docs/gdpr-retention.md).
 */
export default defineEventHandler(async (event) => {
  requireHookAuth(event)
  const { userId } = await readValidatedBody(event, bodySchema.parse)

  const exists = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.id, userId)).get()
  if (!exists) {
    // Nothing mirrored, but their cookie stays readable for 30 days and
    // ensureLocalUser's insert branch would write them back (ADR-0014).
    await tombstoneUser(userId)
    return { ok: true }
  }

  await anonymiseUser(userId)

  return { ok: true }
})
