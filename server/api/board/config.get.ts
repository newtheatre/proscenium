// This end's active milestone types and presets, for the wings' one-tap buttons: every call
// belongs to one end, and front of house's are never offered here (E-121 criteria 1, 2, issue 1313).
export default defineEventHandler(async (event) => {
  await requireDevice(event)
  const [types, activePresets] = await Promise.all([milestoneTypes(false), presets(false)])
  return {
    milestoneTypes: types.filter(type => type.side === 'BACKSTAGE'),
    presets: activePresets.filter(preset => preset.side === 'BACKSTAGE'),
  }
})
