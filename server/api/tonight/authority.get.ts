import { z } from 'zod'
import { activePerformanceId } from '#shared/utils/tonight'

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

  // A picker needs a title and a curtain, and a screen opening cold needs to know which house is
  // running now, so the ids alone were never enough (issue 901).
  const running = await performancesOnNight(resolved.night, resolved.venueId)
  const covered = running.filter(performance => resolved.performanceIds.includes(performance.id))
  const active = activePerformanceId(
    covered.map(performance => ({ performanceId: performance.id, startsAt: performance.startsAt, doorsAt: performance.doorsAt })),
    Date.now() / 1000,
  )

  // Allow-listed: the account row it resolved is the caller's own and has no business in a payload.
  return {
    night: resolved.night,
    role: resolved.role,
    venueId: resolved.venueId,
    performanceIds: resolved.performanceIds,
    performances: covered.map(performance => ({
      id: performance.id,
      showTitle: performance.showTitle,
      startsAt: performance.startsAt,
      venueName: performance.venueName,
      active: performance.id === active,
    })),
    via: resolved.via,
    shiftId: resolved.shiftId ?? null,
  }
})
