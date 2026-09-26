import { eq } from 'drizzle-orm'
import { londonDay, membershipState } from '#shared/utils/membership'

// Your membership as the register sees it, your newest claim (A-130 criterion 4), and the
// student number the account holds, which the claim form starts from (issue 1343).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const graceDays = await configValue(event, 'MEMBERSHIP_GRACE_DAYS')
  const [membership, claim, [held]] = await Promise.all([
    longestTerm(account.id),
    ownClaim(account.id),
    db.select({ studentId: schema.users.studentId }).from(schema.users).where(eq(schema.users.id, account.id)).limit(1),
  ])

  return {
    membership,
    state: membershipState(membership, londonDay(new Date()), graceDays),
    graceDays,
    claim,
    studentId: held?.studentId ?? null,
  }
})
