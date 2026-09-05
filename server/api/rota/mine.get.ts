import type { MyShiftRow } from '#server/utils/rota'

// A member's own shifts, upcoming and not cancelled: what `/rota` shows above the open-shift
// list, and where a venue-move notice's shift can actually be found (E-102, E-103).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const now = Math.floor(Date.now() / 1000)
  const items = await db.all<MyShiftRow>(myShiftsQuery(account.id, now))
  return { items }
})
