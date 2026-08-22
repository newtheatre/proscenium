import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

/** GET /api/bar/tabs/debtor, finding who to charge by exact email. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  await requireBarScope(user)
  const query = await getValidatedQuery(event, querySchema.parse)

  // Exact match only. A name search here would make a bar phone a way to
  // browse the user table.
  const found = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    anonymisedAt: schema.users.anonymisedAt,
  }).from(schema.users).where(eq(schema.users.email, query.email)).get()

  if (!found || found.anonymisedAt) {
    throw createError({
      statusCode: 404,
      statusMessage: 'They need to sign in to the NNT site once before you can start a tab.',
    })
  }

  return {
    userId: found.id,
    name: found.name,
    outstandingPence: await outstandingFor(found.id),
    softCapPence: TAB_SOFT_CAP_PENCE,
  }
})
