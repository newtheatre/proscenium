// Every venue and its current emergency card, including a venue with none yet (E-113 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'emergency-card.read')
  return { venues: await currentCards() }
})
