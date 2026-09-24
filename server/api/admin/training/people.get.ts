import { and, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

const query = z.object({ search: z.string().trim().min(2).max(200) })

// The records screen's picker for a lead, who holds no accounts.read: an id and a name and
// nothing more, to whoever may award a record at all (G-130 criterion 1, 0091).
export default defineEventHandler(async (event) => {
  await requireCatalogueAuthority(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await db.select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(and(
      isNull(schema.users.anonymisedAt),
      searchAcross(input.search, [schema.users.name, schema.users.email, sql`coalesce(${schema.users.studentId}, '')`]),
    ))
    .orderBy(sql`${schema.users.name} collate nocase`)
    .limit(10)

  return { items }
})
