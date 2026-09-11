import { membershipClaimConstraintRefusal, membershipClaimForm } from '#shared/utils/membership-claims'

// Say what you bought at the SU. It creates no membership: an officer records it (A-130).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }
  const input = await readValidatedBodyOrThrow(event, membershipClaimForm)

  const id = newId()
  try {
    await db.insert(schema.membershipClaims).values({
      id,
      userId: account.id,
      studentId: input.studentId,
      startsOn: input.startsOn,
      term: input.term,
    })
  }
  catch (error) {
    // Criterion 1 is the partial unique index, so the second claim is refused by the database
    // rather than by a read that another request could have raced (0047).
    const refusal = membershipClaimConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }

  return { ok: true, id }
})
