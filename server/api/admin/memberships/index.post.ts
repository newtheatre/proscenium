import { eq } from 'drizzle-orm'
import { recordMembership as body } from '#shared/utils/admin-forms'
import { MEMBERSHIP_TERMS, endOfTerm, londonDay } from '#shared/utils/membership'
import { grantMembershipStatements, studentIdConstraintRefusal } from '#shared/utils/membership-claims'
import type { MembershipTerm } from '#shared/utils/membership'

// Record a membership bought at the SU (A-117), its student number in the same batch.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'members.write')
  const input = await readValidatedBodyOrThrow(event, body)

  const [account] = await db.select({ studentId: schema.users.studentId, anonymisedAt: schema.users.anonymisedAt })
    .from(schema.users).where(eq(schema.users.id, input.userId)).limit(1)
  if (!account) throw noSuch('account')
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }
  if (input.startsOn > londonDay(new Date())) {
    throw createError({ statusCode: 400, statusMessage: 'That purchase date has not happened yet' })
  }

  const id = newId()
  const years = input.years as MembershipTerm
  const statements = grantMembershipStatements({
    id,
    userId: input.userId,
    startsOn: input.startsOn,
    years,
    evidence: input.evidence ?? null,
    actorId: resolved.account.id,
    now: Math.floor(Date.now() / 1000),
    studentId: input.studentId,
    held: account.studentId,
  }).map(statement => db.run(statement))

  try {
    await db.batch([statements[0]!, ...statements.slice(1)])
  }
  catch (error) {
    const refusal = studentIdConstraintRefusal(error)
    if (refusal) throw createError(refusal)
    throw error
  }

  return { ok: true, id, expiresOn: endOfTerm(input.startsOn, years), terms: MEMBERSHIP_TERMS }
})
