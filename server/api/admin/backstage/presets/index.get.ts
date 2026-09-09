// Every preset, for the committee's own editing screen (E-121 criterion 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'board.read')
  return { presets: await presets(true) }
})
