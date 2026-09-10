import { eq } from 'drizzle-orm'
import { claimDeclineForm, declineClaimStatements } from '#shared/utils/membership-claims'

// Decline a claim. The member reads the reason, so it is a reply rather than a verdict, and it
// is mandatory (A-130 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No claim named' })
  const resolved = await requirePermission(event, 'members.write')
  const input = await readValidatedBodyOrThrow(event, claimDeclineForm)

  const claim = await findClaim(id)
  if (!claim) throw createError({ statusCode: 404, statusMessage: 'No such claim' })
  if (claim.status !== 'OPEN') {
    throw createError({ statusCode: 409, statusMessage: 'That claim has already been answered' })
  }
  const account = await findById(claim.userId)
  if (!account || account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }

  const now = Math.floor(Date.now() / 1000)
  const statements = declineClaimStatements({
    claimId: id,
    reason: input.reason,
    actorId: resolved.account.id,
    now,
    // The reason is shown to the member and never reaches the trail (0011).
    entry: auditEntry({
      actorId: resolved.account.id,
      action: 'membership.claim.declined',
      target: `claim:${id}`,
      detail: { claim: id },
    }),
  }).map(statement => db.run(statement))
  await db.batch([statements[0]!, ...statements.slice(1)])

  // Guarded writes, so a decision that lost a race wrote nothing: the row says who won (0006).
  const [held] = await db.select({ decidedBy: schema.membershipClaims.decidedBy, decidedAt: schema.membershipClaims.decidedAt })
    .from(schema.membershipClaims).where(eq(schema.membershipClaims.id, id)).limit(1)
  if (held?.decidedBy !== resolved.account.id || held.decidedAt !== now) {
    throw createError({ statusCode: 409, statusMessage: 'That claim has already been answered' })
  }

  await notify(event, {
    type: 'membership.claim.declined',
    userId: claim.userId,
    context: { name: '', reason: input.reason, membershipUrl: `${useRuntimeConfig(event).public.baseURL}/account/membership` },
  })

  return { ok: true }
})
