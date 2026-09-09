// Every milestone type, for the committee's own editing screen (E-121 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'board.read')
  return { types: await milestoneTypes(true) }
})
