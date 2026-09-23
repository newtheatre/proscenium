import { eq } from 'drizzle-orm'
import { renewalTerm } from '#shared/utils/membership'
import { recordClaimStatements, studentIdConstraintRefusal } from '#shared/utils/membership-claims'
import type { MembershipTerm } from '#shared/utils/membership'

// Record a claim: the number to the account, the membership row the A-117 route writes with the
// claim as its evidence, and the claim closed, in one batch (A-130 criteria 2 and 12).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Say which claim you mean' })
  const resolved = await requirePermission(event, 'members.write')

  const claim = await findClaim(id)
  if (!claim) throw noSuch('claim')
  if (claim.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'That claim has already been answered' })
  }

  const [account] = await db.select({ studentId: schema.users.studentId, anonymisedAt: schema.users.anonymisedAt })
    .from(schema.users).where(eq(schema.users.id, claim.userId)).limit(1)
  if (!account || account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }

  // A purchase inside a running term extends it with a row of its own; nothing held is rewritten.
  const held = await longestTerm(claim.userId, claim.startsOn)
  const term = renewalTerm(claim.startsOn, claim.term as MembershipTerm, held?.expiresOn ?? null)
  const expiresOn = term.expiresOn
  const membershipId = newId()
  const now = Math.floor(Date.now() / 1000)
  const actorId = resolved.account.id

  // The number never reaches the trail: detail carries identifiers, not people (0011).
  const entries = {
    granted: auditEntry({
      actorId,
      action: 'membership.granted',
      target: `user:${claim.userId}`,
      detail: { membership: membershipId, years: claim.term, expiresOn, claim: id, extends: term.extends },
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
    studentId: claim.studentId,
    held: account.studentId,
    membership: { id: membershipId, startsOn: term.startsOn, expiresOn },
    actorId,
    now,
    entries,
  }).map(statement => db.run(statement))
  // A number another account holds fails the whole batch on its index: nothing is written (0047).
  try {
    await db.batch([statements[0]!, ...statements.slice(1)])
  }
  catch (error) {
    const refusal = studentIdConstraintRefusal(error)
    if (refusal) throw createError(refusal)
    throw error
  }

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
