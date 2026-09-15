import type { MyOpeningShiftRow } from '#server/utils/bar-openings'
import type { MyShiftRow } from '#server/utils/rota'

// A member's own shifts, upcoming and not cancelled: what `/rota` shows above the open-shift
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
  return { items, openings }
})
