import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { conditionsOf, filterQuerySchema } from '#shared/utils/list-filters'
import { fellowshipsList } from '#shared/utils/fellowships-list'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { tableColumns, whereFrom } from '#server/utils/list-filters'

const query = filterQuerySchema(fellowshipsList)

// The roll of Fellows (A-127, K-129). "Show" defaults to current when nothing is asked, the same
// hidden default the accounts directory gives anonymised rows.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'fellowships.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const clause = whereFrom(fellowshipsList, input, {
    column: tableColumns(schema.fellowships),
    search: [schema.users.name, schema.users.email, schema.fellowships.citation],
    fields: {
      show: (condition) => {
        if (condition.values[0] === 'revoked') return isNotNull(schema.fellowships.revokedAt)
        if (condition.values[0] === 'everyone') return undefined
        return isNull(schema.fellowships.revokedAt)
      },
    },
  })
  const asked = conditionsOf(fellowshipsList, input).some(condition => condition.key === 'show')
  const where = asked ? clause.where : and(isNull(schema.fellowships.revokedAt), clause.where)

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
    .orderBy(...clause.orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})
