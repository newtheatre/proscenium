// The duty manager's own read of tonight's board, the same feed crew see, authenticated rather
// than by device (E-121 criteria 3, 4).
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const night = await ensureNight(resolved.venueId, resolved.night)
  const [messages, acknowledgements] = await Promise.all([
    messagesForNight(night.id),
    acknowledgementsForNight(night.id),
  ])
  return { messages, acknowledgements }
})
