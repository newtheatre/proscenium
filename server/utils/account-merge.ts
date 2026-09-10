import { eq, sql } from 'drizzle-orm'
import { mergeStatements, planGrantMerge } from '#shared/utils/account-merge'
import type { GrantRow, MergeCounts, MergeOutcome, MergePreview, TrainingRecordRow } from '#shared/utils/account-merge'

// The database-touching half of a merge; shared/utils/account-merge.ts builds the plan and SQL.
// Not reached by tests, so it keeps Nitro's ordinary auto-imports rather than naming them (0055).

interface AccountRow {
  id: string
  name: string
  email: string
  anonymisedAt: number | null
}

async function loadAccount(id: string): Promise<AccountRow> {
  const [row] = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    anonymisedAt: schema.users.anonymisedAt,
  }).from(schema.users).where(eq(schema.users.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'No such account' })
  return row
}

// Refused outright, before anything moves, rather than guarded per statement (0059, 0060).
// A-120's last-admin guard applies the same as it does to disabling, closing or erasing.
async function guardMergeable(winnerId: string, loserId: string): Promise<{ winner: AccountRow, loser: AccountRow }> {
  if (winnerId === loserId) {
    throw createError({ statusCode: 400, statusMessage: 'An account cannot be merged into itself' })
  }

  const winner = await loadAccount(winnerId)
  const loser = await loadAccount(loserId)

  if (winner.anonymisedAt !== null || loser.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'An anonymised account cannot take part in a merge' })
  }

  if (await wouldStrandTheSystem('ADMIN', loserId)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That is the last administrator: grant another before merging this one away',
    })
  }

  return { winner, loser }
}

async function countRows(userId: string): Promise<MergeCounts> {
  const [rooms] = await db.select({ n: sql<number>`count(*)` }).from(schema.roomBookings).where(eq(schema.roomBookings.userId, userId))
  const [series] = await db.select({ n: sql<number>`count(*)` }).from(schema.roomSeries).where(eq(schema.roomSeries.userId, userId))
  const [tickets] = await db.select({ n: sql<number>`count(*)` }).from(schema.reservations).where(eq(schema.reservations.userId, userId))
  const [records] = await db.select({ n: sql<number>`count(*)` }).from(schema.trainingRecords).where(eq(schema.trainingRecords.userId, userId))
  const [shifts] = await db.select({ n: sql<number>`count(*)` }).from(schema.shifts).where(eq(schema.shifts.userId, userId))
  const [memberships] = await db.select({ n: sql<number>`count(*)` }).from(schema.memberships).where(eq(schema.memberships.userId, userId))
  const [grants] = await db.select({ n: sql<number>`count(*)` }).from(schema.roleGrants).where(eq(schema.roleGrants.userId, userId))

  return {
    bookings: Number(rooms?.n ?? 0) + Number(series?.n ?? 0) + Number(tickets?.n ?? 0),
    records: Number(records?.n ?? 0),
    shifts: Number(shifts?.n ?? 0),
    memberships: Number(memberships?.n ?? 0),
    grants: Number(grants?.n ?? 0),
  }
}

async function grantsFor(userId: string): Promise<GrantRow[]> {
  return db.select({ id: schema.roleGrants.id, role: schema.roleGrants.role, expiresAt: schema.roleGrants.expiresAt })
    .from(schema.roleGrants).where(eq(schema.roleGrants.userId, userId))
}

async function trainingRecordsFor(userId: string): Promise<TrainingRecordRow[]> {
  return db.select({
    id: schema.trainingRecords.id,
    moduleId: schema.trainingRecords.moduleId,
    awardedOn: schema.trainingRecords.awardedOn,
    expiresOn: schema.trainingRecords.expiresOn,
    expiryOverridden: schema.trainingRecords.expiryOverridden,
    source: schema.trainingRecords.source,
    sessionId: schema.trainingRecords.sessionId,
    grantedBy: schema.trainingRecords.grantedBy,
    evidenceRef: schema.trainingRecords.evidenceRef,
    revokedAt: schema.trainingRecords.revokedAt,
    revokedBy: schema.trainingRecords.revokedBy,
    revokeReason: schema.trainingRecords.revokeReason,
  }).from(schema.trainingRecords).where(eq(schema.trainingRecords.userId, userId))
}

// Everything a dry run needs to show before anything changes (A-123 criterion 1).
export async function previewMerge(winnerId: string, loserId: string): Promise<MergePreview> {
  const { winner, loser } = await guardMergeable(winnerId, loserId)
  const counts = await countRows(loserId)
  return {
    winner: { id: winner.id, name: winner.name, email: winner.email },
    loser: { id: loser.id, name: loser.name, email: loser.email },
    counts,
  }
}

// The merge itself: one `db.batch`, so a constraint a rare double-booking trips (0001, 0003)
// leaves both accounts exactly as they were.
export async function executeMerge(winnerId: string, loserId: string, actorId: string, confirmEmail: string): Promise<MergeOutcome> {
  const { loser } = await guardMergeable(winnerId, loserId)

  if (normaliseEmail(confirmEmail) !== loser.email) {
    throw createError({ statusCode: 400, statusMessage: 'Type the losing account\'s email address exactly to confirm' })
  }

  const counts = await countRows(loserId)
  const [winnerGrants, loserGrants, trainingRecords] = await Promise.all([
    grantsFor(winnerId), grantsFor(loserId), trainingRecordsFor(loserId),
  ])
  const grantPlan = planGrantMerge(winnerGrants, loserGrants)
  const now = Math.floor(Date.now() / 1000)

  const { moves, retireCredentials, tombstone } = mergeStatements({ winnerId, loserId, actorId, grantPlan, trainingRecords, now })

  const entry = auditEntry({
    actorId,
    action: 'account.merged',
    target: `user:${loserId}`,
    detail: { into: winnerId, moved: counts },
  })

  // 0049's shape: the predicate rides the tombstone `UPDATE`, and the audit `INSERT` right after
  // it is conditional on that statement's own `changes()`, both in this one batch.
  const auditInsert = db.run(sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${entry.detail !== null ? JSON.stringify(entry.detail) : null}
    WHERE changes() = 1
  `)

  const writes = [...moves, ...retireCredentials].map(statement => db.run(statement))
  const tombstoneWrite = db.all<{ id: string }>(tombstone)

  const results = await db.batch([writes[0]!, ...writes.slice(1), tombstoneWrite, auditInsert])

  const tombstoned = results[results.length - 2]
  if (!Array.isArray(tombstoned) || tombstoned.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That account changed since it was last checked: look at it again before merging',
    })
  }

  return { merged: true, counts }
}
