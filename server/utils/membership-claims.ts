import { db, schema } from '@nuxthub/db'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
// Named rather than auto-imported: `tests/` typechecks this file under Bun (CONTRIBUTING, 0055).
import { conditionsOf } from '#shared/utils/list-filters'
import { auditEntry } from '#shared/utils/audit'
import { effectiveTerm, londonDay } from '#shared/utils/membership'
import { withdrawClaimStatements } from '#shared/utils/membership-claims'
import { membershipClaimsList } from '#shared/utils/membership-claims-list'
import { tableColumns, whereFrom } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type { Term } from '#shared/utils/membership'
import type { Reference } from './list-filters'
import type { SQL } from 'drizzle-orm'

// `id` is not a guide to insertion order; `rowid` is, and is not a Drizzle column (0006).
function claimsColumn(name: string): Reference | undefined {
  if (name === 'rowid') return sql`${schema.membershipClaims}.rowid`
  return tableColumns(schema.membershipClaims)(name)
}

// The queue through its own declaration (A-130 criterion 10): waiting is the hidden default, and
// an erased person's claim is nobody's to answer, whatever its status.
export function claimsClause(query: ListQuery): { where: SQL, orderBy: SQL[] } {
  const clause = whereFrom(membershipClaimsList, query, {
    column: claimsColumn,
    search: [schema.users.name, schema.users.email, schema.membershipClaims.studentId],
  })
  const asked = conditionsOf(membershipClaimsList, query).some(condition => condition.key === 'status')
  const where = and(
    isNull(schema.users.anonymisedAt),
    asked ? undefined : eq(schema.membershipClaims.status, 'OPEN'),
    clause.where,
  )!
  return { where, orderBy: clause.orderBy }
}

export interface OwnClaim {
  id: string
  studentId: string
  startsOn: string
  term: number
  status: string
  reason: string | null
  decidedAt: number | null
  createdAt: number
}

// The member's newest claim, whatever came of it: an open one to watch, or a declined one to
// read the reason on and put right (A-130 criteria 3 and 4).
export async function ownClaim(userId: string): Promise<OwnClaim | null> {
  const [row] = await db.select({
    id: schema.membershipClaims.id,
    studentId: schema.membershipClaims.studentId,
    startsOn: schema.membershipClaims.startsOn,
    term: schema.membershipClaims.term,
    status: schema.membershipClaims.status,
    reason: schema.membershipClaims.reason,
    decidedAt: schema.membershipClaims.decidedAt,
    createdAt: schema.membershipClaims.createdAt,
  })
    .from(schema.membershipClaims)
    .where(eq(schema.membershipClaims.userId, userId))
    // A claim declined and re-made within one second ties on created_at; insertion order decides.
    .orderBy(desc(schema.membershipClaims.createdAt), desc(sql`${schema.membershipClaims}.rowid`))
    .limit(1)
  return row ?? null
}

export interface HeldClaim {
  id: string
  userId: string
  studentId: string
  startsOn: string
  term: number
  status: string
}

export async function findClaim(id: string): Promise<HeldClaim | undefined> {
  const [row] = await db.select({
    id: schema.membershipClaims.id,
    userId: schema.membershipClaims.userId,
    studentId: schema.membershipClaims.studentId,
    startsOn: schema.membershipClaims.startsOn,
    term: schema.membershipClaims.term,
    status: schema.membershipClaims.status,
  })
    .from(schema.membershipClaims)
    .where(eq(schema.membershipClaims.id, id))
    .limit(1)
  return row
}

// Every term row on the account; a person holds few.
export async function heldTerms(userId: string): Promise<Term[]> {
  return await db.select({ startsOn: schema.memberships.startsOn, expiresOn: schema.memberships.expiresOn })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId))
}

// The term that decides whether the person is current: the run of back-to-back rows around
// today, so a renewal waiting to start extends it (0031, A-130 criterion 13).
export async function longestTerm(userId: string, today = londonDay(new Date())): Promise<Term | null> {
  return effectiveTerm(await heldTerms(userId), today)
}

// Withdraw by predicate: nothing to withdraw is not an error, and the claim is not open either way.
export async function withdrawOpenClaim(userId: string, now: number): Promise<number> {
  const [open] = await db.select({ id: schema.membershipClaims.id })
    .from(schema.membershipClaims)
    .where(and(eq(schema.membershipClaims.userId, userId), eq(schema.membershipClaims.status, 'OPEN')))
    .limit(1)
  if (!open) return 0

  const entry = auditEntry({
    actorId: userId,
    action: 'membership.claim.withdrawn',
    target: `claim:${open.id}`,
    detail: { claim: open.id },
  })
  const statements = withdrawClaimStatements({ claimId: open.id, userId, now, entry }).map(statement => db.run(statement))
  await db.batch([statements[0]!, ...statements.slice(1)])
  return 1
}
