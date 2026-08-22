import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  debtorUserId: z.string().trim().min(1),
  /** The figure the screen showed, and the one typed into the reader. */
  expectedTotalPence: z.coerce.number().int().min(1),
})

/** POST /api/bar/tabs/settle, clearing someone's tab at the counter. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const night = await requireBarScope(user)
  const input = await readValidatedBody(event, bodySchema.parse)

  const session = await db.select({ id: schema.barSessions.id }).from(schema.barSessions)
    .where(and(eq(schema.barSessions.night, night), isNull(schema.barSessions.closedAt))).get()

  return await settleTab({
    debtorUserId: input.debtorUserId,
    takenByUserId: user.id,
    source: 'TILL',
    expectedTotalPence: input.expectedTotalPence,
    barSessionId: session?.id ?? null,
  })
})
