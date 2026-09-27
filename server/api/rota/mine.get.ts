import { showNightOf } from '#shared/utils/show-night'
import type { MyOpeningShiftRow } from '#server/utils/bar-openings'
import type { MyShiftRow } from '#server/utils/rota'
import type { DutyManagerToTell } from '#server/utils/tonight'

// A member's own shifts from tonight on, not cancelled: what `/rota` shows above the open-shift
// list, and where a venue-move notice's shift can actually be found (E-102, E-103).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const now = Math.floor(Date.now() / 1000)
  // A bar opening is a night's work like any other, labelled by the opening rather than by a show
  // title, so it belongs on the same list (E-130 criterion 4).
  const [items, openings] = await Promise.all([
    db.all<MyShiftRow>(myShiftsQuery(account.id, now)),
    db.all<MyOpeningShiftRow>(myOpeningShiftsQuery(account.id, now)),
  ])

  // Tonight's confirmed shift names who to tell in place of a release the server now refuses
  // (issue 1305). Bounded by the member's own shifts tonight, never by the rota's size (0003).
  const tonight = showNightOf(new Date(now * 1000))
  const dutyManagers: Record<string, DutyManagerToTell | null> = {}
  for (const item of items) {
    if (item.status !== 'CONFIRMED' || item.role === 'DUTY_MANAGER' || item.performanceId in dutyManagers) continue
    if (showNightOf(new Date(item.startsAt * 1000)) !== tonight) continue
    dutyManagers[item.performanceId] = dutyManagerToTell(await tonightTeam(item.performanceId))
  }

  return { items, openings, dutyManagers }
})
