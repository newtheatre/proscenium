// The sessions open to a member, and exactly where they stand on each one.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const closesHours = await configValue(event, 'SESSION_SIGNUP_CLOSES_HOURS')

  const items = await sessionsForMember(account.id, londonToday(), closesHours)
  return { items, total: items.length }
})
