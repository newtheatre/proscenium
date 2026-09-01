import { saysStanding, windowStart } from '#shared/utils/no-shows'

// Your own no-show record, and what it currently costs you.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const now = new Date()
  const standing = await standingOf(event, account.id, now)

  return {
    ...standing,
    says: saysStanding(standing.standing, standing.count, standing.ladder),
    // Withdrawals included, so a member can see a correction rather than wonder where one went.
    records: await noShowsFor(account.id, windowStart(now, standing.windowDays)),
  }
})
