import { boardWindowBounds, boardWindowQuery } from '#shared/utils/rota-board'
import type { RosterPerformance, RosterShiftRow } from '#server/utils/rota'

// The per-performance card the console shows (issue 933): every non-cancelled shift on the
// nights the window names, whole rather than paged (E-107 criterion 7).

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const window = await getValidatedQueryOrThrow(event, boardWindowQuery)
  const bounds = boardWindowBounds(window)

  const [performances, shifts] = await Promise.all([
    db.all<RosterPerformance>(rosterPerformancesQuery(bounds)),
    db.all<RosterShiftRow>(rosterShiftsQuery(bounds)),
  ])

  return {
    from: window.from,
    to: window.to,
    items: performances.map(performance => ({
      ...performance,
      shifts: shifts.filter(shift => shift.performanceId === performance.performanceId),
    })),
  }
})
