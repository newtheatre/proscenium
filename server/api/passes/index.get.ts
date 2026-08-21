import { db, schema } from '@nuxthub/db'
import { and, count, desc, eq, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { listPasses } from '~~/shared/utils/abilities'

const querySchema = z.object({
  /** Reference, holder name or holder email. */
  q: z.string().optional(),
  status: z.enum(['ACTIVE', 'CANCELLED', 'EXPIRED']).optional(),
  passTypeId: z.string().optional(),
  /** If given, each pass reports whether it may be redeemed for this performance. */
  performanceId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
})

/**
 * GET /api/passes — search issued passes.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listPasses)

  const { q, status, passTypeId, performanceId, page, limit } = await getValidatedQuery(event, querySchema.parse)

  const filters = []
  if (status) filters.push(eq(schema.passes.status, status))
  if (passTypeId) filters.push(eq(schema.passes.passTypeId, passTypeId))
  if (q?.trim()) {
    const term = `%${q.trim().toLowerCase()}%`
    filters.push(or(
      eq(schema.passes.reference, q.trim().toUpperCase()),
      like(sql`lower(${schema.users.name})`, term),
      like(sql`lower(${schema.users.email})`, term),
    ))
  }
  const where = filters.length ? and(...filters) : undefined

  const [totalRow] = await db
    .select({ n: count() })
    .from(schema.passes)
    .innerJoin(schema.users, eq(schema.passes.userId, schema.users.id))
    .where(where)

  const rows = await db
    .select({
      id: schema.passes.id,
      reference: schema.passes.reference,
      status: schema.passes.status,
      pricePaid: schema.passes.pricePaid,
      issuedAt: schema.passes.issuedAt,
      notes: schema.passes.notes,
      passTypeId: schema.passes.passTypeId,
      passTypeName: schema.passTypes.name,
      validFrom: schema.passTypes.validFrom,
      validTo: schema.passTypes.validTo,
      holderId: schema.users.id,
      holderName: schema.users.name,
      holderEmail: schema.users.email,
    })
    .from(schema.passes)
    .innerJoin(schema.users, eq(schema.passes.userId, schema.users.id))
    .innerJoin(schema.passTypes, eq(schema.passes.passTypeId, schema.passTypes.id))
    .where(where)
    .orderBy(desc(schema.passes.issuedAt))
    .limit(limit)
    .offset((page - 1) * limit)

  // Decided for the whole page in four queries. Calling canRedeem per row cost
  // five D1 queries each — 500 subrequests at limit=100.
  let withEligibility: Array<typeof rows[number] & { redeemable?: RedeemCheck }> = rows
  if (performanceId) {
    const redeemability = await redeemabilityForPage(performanceId, rows)
    withEligibility = rows.map(row => ({ ...row, redeemable: redeemability.get(row.id) }))
  }

  return {
    rows: withEligibility,
    total: totalRow?.n ?? 0,
    page,
    limit,
  }
})
