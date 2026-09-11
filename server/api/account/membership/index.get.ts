import { londonDay } from '#shared/utils/membership'
import { membershipState } from '#shared/utils/membership-claims'

// Your membership as the register sees it, and your newest claim (A-130 criterion 4).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const graceDays = await configValue(event, 'MEMBERSHIP_GRACE_DAYS')
  const [membership, claim] = await Promise.all([longestTerm(account.id), ownClaim(account.id)])

  return {
    membership,
    state: membershipState(membership, londonDay(new Date()), graceDays),
    graceDays,
    claim,
  }
})
