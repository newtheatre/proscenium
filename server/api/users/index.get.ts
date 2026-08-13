import { db, schema } from '@nuxthub/db'
import { and, asc, count, isNull, isNotNull, or, sql } from 'drizzle-orm'
import { listUsers } from '~~/shared/utils/abilities'

/**
 * GET /api/users — list local user mirrors. Staff only.
 *
 * Identity (credentials, roles, verification) lives in the central auth
 * service; this lists the app-side mirror — who exists here, for reservation
 * attachment and lookup. Role filtering left with the role columns; use the
 * auth service admin for identity questions.
 *
 * Two modes:
 *  - `?email=` returns at most the one matching user. Used by the box-office
 *    walk-in lookup, which must not pull the user table into a volunteer's
 *    browser.
 *  - otherwise a paginated `{ rows, total, page, limit }` envelope, optionally
 *    filtered by `q` against name and email.
 */
// Anonymised bookers (retention policy / account closure) and legacy
// placeholder rows are records, not people — they never load in listings or
// lookups, and surface only as a count.
const notAnonymised = and(
  isNull(schema.users.anonymisedAt),
  sql`${schema.users.email} NOT LIKE '%.invalid'`,
)

export default defineEventHandler(async (event) => {
  await authorize(event, listUsers)

  const { email } = getQuery(event)

  // Single-user lookup by exact address.
  if (typeof email === 'string' && email.length > 0) {
    const user = await db.query.users.findFirst({
      where: (u, { eq: eqFn, sql: sqlFn, and: andFn }) => andFn(
        eqFn(sqlFn`lower(${u.email})`, email.toLowerCase()),
        notAnonymised,
      ),
    })
    return user ? [user] : []
  }

  const { page, limit, q } = await getValidatedQuery(event, paginationSchema.parse)

  const filters = [notAnonymised]
  if (q) {
    filters.push(or(
      likeInsensitive(schema.users.name, q),
      likeInsensitive(schema.users.email, q),
    ))
  }
  const where = and(...filters)

  const [totalRow] = await db.select({ n: count() }).from(schema.users).where(where)
  const total = totalRow?.n ?? 0

  // The number somewhere: standing count of hidden anonymised/placeholder rows.
  const [hiddenRow] = await db.select({ n: count() }).from(schema.users)
    .where(or(isNotNull(schema.users.anonymisedAt), sql`${schema.users.email} LIKE '%.invalid'`))
  const hiddenAnonymised = hiddenRow?.n ?? 0

  if (total === 0) return { ...paginated([], 0, { page, limit }), hiddenAnonymised }

  const rows = await db.query.users.findMany({
    where: () => where,
    orderBy: [asc(schema.users.email)],
    limit,
    offset: offsetFor({ page, limit }),
  })

  return { ...paginated(rows, total, { page, limit }), hiddenAnonymised }
})
