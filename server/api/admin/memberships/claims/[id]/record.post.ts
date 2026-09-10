import { eq } from 'drizzle-orm'
import { endOfTerm } from '#shared/utils/membership'
import { recordClaimStatements } from '#shared/utils/membership-claims'
import type { MembershipTerm } from '#shared/utils/membership'

// Record a claim: the number to the account, the membership by the A-117 path with the claim as
// its evidence, and the claim closed, in one batch (A-130 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No claim named' })
  const resolved = await requirePermission(event, 'members.write')

  const claim = await findClaim(id)
  if (!claim) throw createError({ statusCode: 404, statusMessage: 'No such claim' })
  if (claim.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'That claim has already been answered' })
  }

  const [account] = await db.select({ studentId: schema.users.studentId, anonymisedAt: schema.users.anonymisedAt })
    .from(schema.users).where(eq(schema.users.id, claim.userId)).limit(1)
  if (!account || account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }

  // Unique across accounts, so a number typed against the wrong person is refused rather than
  // quietly moved (0031).
  const writesNumber = account.studentId !== claim.studentId
  if (writesNumber) {
    const [taken] = await db.select({ id: schema.users.id })
      .from(schema.users).where(eq(schema.users.studentId, claim.studentId)).limit(1)
    if (taken && taken.id !== claim.userId) {
      throw createError({ statusCode: 409, statusMessage: 'Another account already holds that student number' })
    }
  }

  const membershipId = newId()
  const expiresOn = endOfTerm(claim.startsOn, claim.term as MembershipTerm)
  const now = Math.floor(Date.now() / 1000)
  const actorId = resolved.account.id

  // The number never reaches the trail: detail carries identifiers, not people (0011).
  const entries = {
    studentId: auditEntry({
      actorId,
      action: 'account.student-id.recorded',
      target: `user:${claim.userId}`,
      detail: { replaced: account.studentId !== null },
    }),
    granted: auditEntry({
      actorId,
      action: 'membership.granted',
      target: `user:${claim.userId}`,
      detail: { membership: membershipId, years: claim.term, expiresOn, claim: id },
    }),
    recorded: auditEntry({
      actorId,
      action: 'membership.claim.recorded',
      target: `claim:${id}`,
      detail: { claim: id, membership: membershipId },
    }),
  }

  const statements = recordClaimStatements({
    claimId: id,
    userId: claim.userId,
    studentId: writesNumber ? claim.studentId : null,
    membership: { id: membershipId, startsOn: claim.startsOn, expiresOn },
    actorId,
    now,
    entries,
  }).map(statement => db.run(statement))
  await db.batch([statements[0]!, ...statements.slice(1)])

  // Every write was guarded on the claim still being open, so the loser of a race wrote nothing:
  // the membership row is the proof of who won (0006).
  const [won] = await db.select({ id: schema.memberships.id })
    .from(schema.memberships).where(eq(schema.memberships.id, membershipId)).limit(1)
  if (!won) throw createError({ statusCode: 409, statusMessage: 'That claim has already been answered' })

  await notify(event, {
    type: 'membership.claim.recorded',
    userId: claim.userId,
    context: { name: '', expiresOn, membershipUrl: `${useRuntimeConfig(event).public.baseURL}/account/membership` },
  })

  return { ok: true, membershipId, expiresOn }
})
