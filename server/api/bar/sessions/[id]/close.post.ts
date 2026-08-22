import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  closingNote: z.string().trim().max(2000).nullable().optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
}).optional().default({})

/** POST /api/bar/sessions/:id/close — shut the bar for the night (docs/13 §4.5). */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const night = await requireBarScope(user)
  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, body => bodySchema.parse(body ?? {}))

  const session = await db.select({ id: schema.barSessions.id, night: schema.barSessions.night })
    .from(schema.barSessions)
    .where(and(eq(schema.barSessions.id, id), isNull(schema.barSessions.closedAt)))
    .get()

  if (!session) {
    throw createError({ statusCode: 409, statusMessage: 'That session is already closed, or does not exist.' })
  }
  if (session.night !== night) {
    throw createError({ statusCode: 409, statusMessage: 'That session is from another night.' })
  }

  await db.update(schema.barSessions).set({
    closedAt: new Date(),
    closedByUserId: user.id,
    closingNote: input.closingNote ?? null,
    checklist: input.checklist ?? null,
  }).where(eq(schema.barSessions.id, id))

  return { id, closed: true }
})
