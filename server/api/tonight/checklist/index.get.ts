// Tonight's checklist, stamped from the current configuration the first time it is read (E-114
// criteria 1, 2, 3). Carries the close, so a reload does not forget the night is already closed.
export default defineEventHandler(async (event) => {
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER')
  const [items, close] = await Promise.all([
    checklistFor(resolved.venueId, resolved.night),
    closeFor(resolved.venueId, resolved.night),
  ])
  return { night: resolved.night, venueId: resolved.venueId, items, close }
})
