import { seesAccessTonight } from '#shared/utils/night-hub'

// Tonight's house and show information for any of the three roles, access wording for the door and
// the duty manager only (issue 1307, D-127 criterion 3); the door is tried first so it reads it.
export default defineEventHandler(async (event) => {
  const resolved = await requireAnyNightAuthority(event, ['DOOR', 'DUTY_MANAGER', 'BAR'])

  const performances = await Promise.all(resolved.performanceIds.map(performanceId =>
    tonightView(performanceId, seesAccessTonight(resolved.role)),
  ))

  return {
    night: resolved.night,
    venueId: resolved.venueId,
    role: resolved.role,
    performances: performances.filter(one => one !== null),
  }
})
