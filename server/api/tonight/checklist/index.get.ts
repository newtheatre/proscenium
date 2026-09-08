// Tonight's checklist at the duty manager's venue, stamped from the current configuration the
// first time it is read (E-114 criteria 1, 2, 3).
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const items = await checklistFor(resolved.venueId, resolved.night)
  return { night: resolved.night, venueId: resolved.venueId, items }
})
