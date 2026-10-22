// The modules a member could take next, each with its one action (G-102 c6, issue 1335). A
// committee-only module they cannot take is not something they could do next (0242).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const today = londonToday()
  const [steps, actionFor] = await Promise.all([
    whatsNextFor(account.id, today),
    trainingActionsFor(account.id, today, await configValue(event, 'SESSION_SIGNUP_CLOSES_HOURS')),
  ])
  const items = steps.map(step => ({ ...step, action: actionFor(step.id) }))
    .filter(step => step.action.kind !== 'COMMITTEE_ONLY')
  return { items, total: items.length }
})
