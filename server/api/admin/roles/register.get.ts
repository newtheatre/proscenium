import { and, eq, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { rolesList } from '#shared/utils/roles-list'
import { grantsClause, holderCounts, pendingClause, registerTotal } from '#server/utils/roles-register'

// Lapsed grants ride beside the declared fields the way shadow accounts do: asked for without
// filtering to them (0071, A-131 criterion 3).
const query = filterQuerySchema(rolesList).extend({ includeLapsed: yesOrNo.default(false) })

// The standing report is the exception's whole point, so it is short and never paged through.
const PERMANENT_SHOWN = 50

// A handover's worth of grants waiting on a first sign-in, listed apart from holders (A-132).
const PENDING_SHOWN = 50

// The role register: who holds what, with the counts the role tiles read (A-131).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'accounts.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const now = Math.floor(Date.now() / 1000)
  const { where, orderBy, hiddenLapsed } = grantsClause(input, now)

  // The grantor's name is joined rather than stored: an id on a screen is no provenance at all
  // (0032), and an erased grantor reads as their tombstone (0011).
  const grantor = alias(schema.users, 'grantor')
  const columns = {
    id: schema.roleGrants.id,
    userId: schema.roleGrants.userId,
    name: schema.users.name,
    email: schema.users.email,
    role: schema.roleGrants.role,
    expiresAt: schema.roleGrants.expiresAt,
    grantedAt: schema.roleGrants.grantedAt,
    grantedBy: grantor.name,
    note: schema.roleGrants.note,
    disabled: schema.users.disabled,
  }
  const grants = () => db.select(columns)
    .from(schema.roleGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.roleGrants.userId))
    .leftJoin(grantor, eq(grantor.id, schema.roleGrants.grantedBy))
  const isLive = <Row extends { expiresAt: number | null }>(row: Row) => ({ ...row, live: row.expiresAt === null || row.expiresAt > now })

  const items = await grants()
    .where(where)
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  const permanent = await grants()
    .where(and(isNull(schema.roleGrants.expiresAt), isNull(schema.users.anonymisedAt)))
    .orderBy(schema.roleGrants.role, sql`${schema.users.name} collate nocase`)
    .limit(PERMANENT_SHOWN)

  const pending = await grants()
    .where(pendingClause())
    .orderBy(schema.roleGrants.role, sql`${schema.users.name} collate nocase`)
    .limit(PENDING_SHOWN)

  return {
    ...envelope(
      items.map(isLive),
      await registerTotal(where),
      input.page,
      input.pageSize,
    ),
    counts: await holderCounts(now),
    permanent: permanent.map(row => ({ ...row, live: true })),
    pending: pending.map(isLive),
    lapsedHidden: hiddenLapsed ? await registerTotal(hiddenLapsed) : 0,
  }
})
