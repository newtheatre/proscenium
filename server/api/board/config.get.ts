// The active milestone types and presets, for the board's own one-tap buttons (E-121 criteria 1, 2).
export default defineEventHandler(async (event) => {
  await requireDevice(event)
  const [types, activePresets] = await Promise.all([milestoneTypes(false), presets(false)])
  return { milestoneTypes: types, presets: activePresets }
})
