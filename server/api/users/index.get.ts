import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, like, or, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { listUsers } from '~~/shared/utils/abilities'

const listQuerySchema = paginationSchema.extend({
  role: z.enum(['ADMIN', 'MANAGER', 'BOX_OFFICE']).optional(),
})

/**
 * GET /api/users — list users. Staff only.
 *
 * Two modes:
 *  - `?email=` returns at most the one matching user. Used by the box-office
 *    walk-in lookup, which must not pull the user table into a volunteer's
 *    browser.
 *  - otherwise a paginated `{ rows, total, page, limit }` envelope, optionally
 *    filtered by `q` against name and email.
 *
 * The legacy import took this table from 622 rows to 9,957, so the previous
 * unpaginated version returned ~20,000 rows (each user plus a roles subquery)
 * to render ten.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listUsers)

  const { email } = getQuery(event)

  // Single-user lookup by exact address.
  if (typeof email === 'string' && email.length > 0) {
    const user = await db.query.users.findFirst({
      ...userWithRolesQuery,
      where: (u, { eq, sql: sqlFn }) => eq(sqlFn`lower(${u.email})`, email.toLowerCase()),
    })
    return user ? [formatUserResponse(user)] : []
  }

  const { page, limit, q, role } = await getValidatedQuery(event, listQuerySchema.parse)

  const filters = []
  if (q) {
    filters.push(or(
      like(sql`lower(${schema.users.name})`, likeTerm(q)),
      like(sql`lower(${schema.users.email})`, likeTerm(q)),
    ))
  }
  if (role) {
    // Subquery, not a joined filter — a user can hold several roles and a join
    // would return them more than once.
    filters.push(inArray(
      schema.users.id,
      db.select({ id: schema.userRoles.userId })
        .from(schema.userRoles)
        .where(eq(schema.userRoles.role, role)),
    ))
  }
  const where = filters.length ? and(...filters) : undefined

  const [totalRow] = await db.select({ n: count() }).from(schema.users).where(where)
  const total = totalRow?.n ?? 0
  if (total === 0) return paginated([], 0, { page, limit })

  const rows = await db.query.users.findMany({
    ...userWithRolesQuery,
    where: () => where,
    orderBy: [asc(schema.users.email)],
    limit,
    offset: offsetFor({ page, limit }),
  })

  return paginated(rows.map(formatUserResponse), total, { page, limit })
})
