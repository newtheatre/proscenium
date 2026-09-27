import { z } from 'zod'
import { seesAccessTonight } from '#shared/utils/night-hub'

// Tonight's house and show information for any of the three roles, the door tried first. Access
// wording is decrypted, and an officer recorded, only when asked, for the door or duty manager (0098).
const query = z.object({ access: yesOrNo.optional() })

export default defineEventHandler(async (event) => {
  const { access: asked } = await getValidatedQueryOrThrow(event, query)
  const resolved = await requireAnyNightAuthority(event, ['DOOR', 'DUTY_MANAGER', 'BAR'], {}, { recordsRead: role => Boolean(asked) && seesAccessTonight(role) })
  const withAccess = Boolean(asked) && seesAccessTonight(resolved.role)

  const performances = await Promise.all(resolved.performanceIds.map(performanceId => tonightView(performanceId, withAccess)))

  return {
    night: resolved.night,
    venueId: resolved.venueId,
    role: resolved.role,
    performances: performances.filter(one => one !== null),
  }
})
