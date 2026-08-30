import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { MEMBER_FILTERS, registerPredicate } from './index.get'

// A technical bound rather than a policy one, so it is a constant and not a setting (0012).
const EXPORT_LIMIT = 5000

const query = z.object({
  filter: z.enum(MEMBER_FILTERS).default('current'),
  search: z.string().trim().max(200).optional(),
})

const COLUMNS = ['name', 'email', 'studentId', 'startsOn', 'expiresOn', 'source', 'confirmed'] as const

// Quoted always: a name with a comma in it would otherwise split the row.
const cell = (value: unknown): string => `"${String(value ?? '').replaceAll('"', '""')}"`

// The register as CSV, which is what an SU return is made from (A-117 criterion 5).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'members.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const where = registerPredicate(input.filter, input.search, await configValue(event, 'MEMBERSHIP_GRACE_DAYS'))

  const rows = await db.select({
    name: schema.users.name,
    email: schema.users.email,
    studentId: schema.users.studentId,
    startsOn: schema.memberships.startsOn,
    expiresOn: schema.memberships.expiresOn,
    source: schema.memberships.source,
    confirmedAt: schema.memberships.confirmedAt,
  })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(where)
    .orderBy(desc(schema.memberships.expiresOn))
    .limit(EXPORT_LIMIT)

  // Taking a copy of the register is an act on it, so it lands in the trail.
  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'membership.exported',
    target: null,
    detail: { filter: input.filter, rows: rows.length, capped: rows.length === EXPORT_LIMIT },
  }))

  const lines = [COLUMNS.join(',')]
  for (const row of rows) {
    lines.push([
      cell(row.name), cell(row.email), cell(row.studentId), cell(row.startsOn),
      cell(row.expiresOn), cell(row.source), cell(row.confirmedAt ? 'yes' : 'no'),
    ].join(','))
  }

  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', 'attachment; filename="membership-register.csv"')
  return lines.join('\n')
})
