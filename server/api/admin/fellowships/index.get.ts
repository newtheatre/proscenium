import { and, asc, eq, isNull, isNotNull, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { envelope, offsetFor, pageQuery } from '#shared/utils/pagination'
import type { SQL } from 'drizzle-orm'

const query = pageQuery.extend({
  search: z.string().trim().max(200).optional(),
  show: z.enum(['current', 'revoked', 'everyone']).default('current'),
})

// The roll of Fellows (A-127).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'fellowships.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const terms: SQL[] = []
  if (input.show === 'current') terms.push(isNull(schema.fellowships.revokedAt))
  if (input.show === 'revoked') terms.push(isNotNull(schema.fellowships.revokedAt))
  if (input.search) {
    const wanted = `%${input.search.toLowerCase()}%`
    terms.push(or(
      like(sql`lower(${schema.users.name})`, wanted),
      like(sql`lower(${schema.users.email})`, wanted),
      like(sql`lower(${schema.fellowships.citation})`, wanted),
    )!)
  }
  const where = terms.length ? and(...terms) : undefined

  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.fellowships)
    .innerJoin(schema.users, eq(schema.users.id, schema.fellowships.userId))
    .where(where)

  // An explicit column list: the person is joined for their name, not for everything else on them.
  const items = await db.select({
    id: schema.fellowships.id,
    userId: schema.fellowships.userId,
    name: schema.users.name,
    anonymised: sql<boolean>`${schema.users.anonymisedAt} is not null`,
    awardedOn: schema.fellowships.awardedOn,
    awardedBy: schema.fellowships.awardedBy,
    citation: schema.fellowships.citation,
    revokedAt: schema.fellowships.revokedAt,
  })
    .from(schema.fellowships)
    .innerJoin(schema.users, eq(schema.users.id, schema.fellowships.userId))
    .where(where)
    .orderBy(asc(schema.fellowships.awardedOn))
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})
