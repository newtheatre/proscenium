import { z } from 'zod'
import { MEMBERSHIP_TERMS, endOfTerm, londonDay } from '#shared/utils/membership'
import type { MembershipTerm } from '#shared/utils/membership'

const body = z.object({
  userId: z.string().min(1).max(64),
  // The day it was bought, which is what the term runs from (0031).
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Give the date as YYYY-MM-DD'),
  years: z.union([z.literal(1), z.literal(3)]),
  // The SU's own reference for this purchase, so a query has something to check against.
  evidence: z.string().trim().max(200).optional(),
  // Recorded on the account rather than the membership: one person, one number (0031).
  studentId: z.string().trim().max(32).optional(),
})

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
