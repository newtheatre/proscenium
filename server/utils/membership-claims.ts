import { db, schema } from '@nuxthub/db'
import { and, desc, eq, sql } from 'drizzle-orm'

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

// The longest-running term the person holds, which is the one that decides whether they are
// current: the same choice hasCurrentMembership makes (0031).
export async function longestTerm(userId: string): Promise<{ startsOn: string, expiresOn: string } | null> {
  const [term] = await db.select({
    startsOn: schema.memberships.startsOn,
    expiresOn: schema.memberships.expiresOn,
  })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId))
    .orderBy(desc(schema.memberships.expiresOn))
    .limit(1)
  return term ?? null
}

// Withdraw by predicate: nothing to withdraw is not an error, and the claim is not open either way.
export async function withdrawOpenClaim(userId: string, now: number): Promise<number> {
  const withdrawn = await db.update(schema.membershipClaims)
    .set({ status: 'WITHDRAWN', decidedAt: now })
    .where(and(
      eq(schema.membershipClaims.userId, userId),
      eq(schema.membershipClaims.status, 'OPEN'),
    ))
    .returning({ id: schema.membershipClaims.id })
  return withdrawn.length
}
