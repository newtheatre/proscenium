import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/tabs/:userId, one person's tab, itemised. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const userId = getRouterParam(event, 'userId')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'Whose tab?' })

  const person = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    anonymisedAt: schema.users.anonymisedAt,
  }).from(schema.users).where(eq(schema.users.id, userId)).get()

  if (!person) throw createError({ statusCode: 404, statusMessage: 'No such person.' })

  const [outstanding, settled, outstandingPence] = await Promise.all([
    chargesFor(userId),
    chargesFor(userId, true),
    outstandingFor(userId),
  ])

  return { person, outstanding, settled, outstandingPence, softCapPence: TAB_SOFT_CAP_PENCE }
})
