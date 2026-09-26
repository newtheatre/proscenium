import { z } from 'zod'

// The glance asks for tonight's access wording; the hub, polling for the house, does not. A venue
// narrows a night when two are running, as the authority route's own scope does (E-127).
const query = z.object({ access: yesOrNo.optional(), venueId: z.string().min(1).optional() })

// Everything the duty manager's tonight screen shows in one call (E-112 criteria 1 and 2): what every
// role reads (`tonightView`), with tonight's team besides.
export default defineEventHandler(async (event) => {
  const { access: withAccess = false, venueId } = await getValidatedQueryOrThrow(event, query)
  // Decrypting access wording (D-127) is the one read an officer's bypass records (0098).
  const resolved = await requireNightAuthority(event, 'DUTY_MANAGER', venueId ? { venueId } : {}, { recordsRead: withAccess })

  const performances = await Promise.all(resolved.performanceIds.map(async (performanceId) => {
    // Only when asked, so the wording is never read without the read being recorded.
    const [view, team] = await Promise.all([tonightView(performanceId, withAccess), tonightTeam(performanceId)])
    return view && { ...view, access: view.access ?? [], team }
  }))

  return {
    night: resolved.night,
    venueId: resolved.venueId,
    performances: performances.filter(one => one !== null),
  }
})
