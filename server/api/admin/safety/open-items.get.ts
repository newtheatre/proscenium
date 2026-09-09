// The safety officer's open-items list: every incident at a routed severity with no closure
// yet, across every night, not only tonight's (E-116 criterion 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'safety.read')
  return { items: await openFollowUps() }
})
