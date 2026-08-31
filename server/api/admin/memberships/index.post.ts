import { recordMembership as body } from '#shared/utils/admin-forms'
import { MEMBERSHIP_TERMS, endOfTerm, londonDay } from '#shared/utils/membership'
import type { MembershipTerm } from '#shared/utils/membership'

// Record a membership bought at the SU (A-117).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'members.write')
  const input = await readValidatedBodyOrThrow(event, body)

  const account = await findById(input.userId)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }
  if (input.startsOn > londonDay(new Date())) {
    throw createError({ statusCode: 400, statusMessage: 'That purchase date has not happened yet' })
  }

  const id = newId()
  const writes = [
    db.insert(schema.memberships).values({
      id,
      userId: input.userId,
      startsOn: input.startsOn,
      expiresOn: endOfTerm(input.startsOn, input.years as MembershipTerm),
      source: 'MANUAL',
      evidence: input.evidence ?? null,
      grantedBy: resolved.account.id,
    }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'membership.granted',
      target: `user:${input.userId}`,
      detail: { membership: id, years: input.years, expiresOn: endOfTerm(input.startsOn, input.years as MembershipTerm) },
    })),
  ]

  await db.batch([writes[0]!, ...writes.slice(1)])
  if (input.studentId) await recordStudentId(input.userId, input.studentId, resolved.account.id)

  return { ok: true, id, expiresOn: endOfTerm(input.startsOn, input.years as MembershipTerm), terms: MEMBERSHIP_TERMS }
})
