import { z } from 'zod'

// What tonight's screens ask before they render anything: who am I here, and what do I cover.
// Guarded, because a screen that asks this is about to do something (E-111 criterion 5).
const scope = z.object({
  role: z.enum(NIGHT_ROLES),
  night: z.string().refine(isShowNight, 'a show night is labelled YYYY-MM-DD').optional(),
  venueId: z.string().min(1).optional(),
  performanceId: z.string().min(1).optional(),
})

export default defineEventHandler(async (event) => {
  const { role, ...narrowed } = await getValidatedQueryOrThrow(event, scope)
  const resolved = await requireNightAuthority(event, role, narrowed)

  // Allow-listed: the account row it resolved is the caller's own and has no business in a payload.
  return {
    night: resolved.night,
    role: resolved.role,
    venueId: resolved.venueId,
    performanceIds: resolved.performanceIds,
    via: resolved.via,
    shiftId: resolved.shiftId ?? null,
  }
})
