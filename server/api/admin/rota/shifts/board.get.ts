import type { RosterPerformance, RosterShiftRow } from '#server/utils/rota'

// The per-performance card the console shows (issue 933): every non-cancelled shift on the
// next run of performances, whole rather than paged, the way a member's own list is bounded.
const BOARD_WINDOW = 20

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const now = Math.floor(Date.now() / 1000)

  const [performances, shifts] = await Promise.all([
    db.all<RosterPerformance>(rosterPerformancesQuery(now, BOARD_WINDOW)),
    db.all<RosterShiftRow>(rosterShiftsQuery(now, BOARD_WINDOW)),
  ])

  return {
    items: performances.map(performance => ({
      ...performance,
      shifts: shifts.filter(shift => shift.performanceId === performance.performanceId),
    })),
  }
})
