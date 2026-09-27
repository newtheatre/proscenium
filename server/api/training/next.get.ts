// The modules a member could take next, computed on every read so a new record shows immediately,
// each with the one action that acts on it (G-102 criterion 6, issue 1335).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const today = londonToday()
  const [steps, actionFor] = await Promise.all([
    whatsNextFor(account.id, today),
    trainingActionsFor(account.id, today, await configValue(event, 'SESSION_SIGNUP_CLOSES_HOURS')),
  ])
  const items = steps.map(step => ({ ...step, action: actionFor(step.id) }))
  return { items, total: items.length }
})
