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
    // Nothing mirrored here: an erasure of someone who never used this app.
    return { ok: true }
  }

  await anonymiseUser(userId)

  return { ok: true }
})
