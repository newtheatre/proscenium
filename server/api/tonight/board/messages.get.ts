// The duty manager's own read of tonight's board, the same feed crew see, authenticated rather
// than by device (E-121 criteria 3, 4, 7), with front of house's own calls (issue 1313).
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const night = await ensureNight(resolved.venueId, resolved.night)
  const [messages, acknowledgements, seen, activePresets, types] = await Promise.all([
    messagesForNight(night.id),
    acknowledgementsForNight(night.id),
    seenAcross(night.id),
    presets(false),
    milestoneTypes(false),
  ])
  return {
    messages,
    acknowledgements,
    seen,
    presets: activePresets.filter(preset => preset.side === 'FOH'),
    milestoneTypes: types.filter(type => type.side === 'FOH'),
  }
})
