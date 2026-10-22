import { zNightQuery } from '#shared/utils/night-reconciliation'

// The night's expected SumUp Z, itemised, and every reading recorded against it, current first
// (I-104 criteria 1, 2), whether its day is in a closed period (I-107), and which tills are still open.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const { night } = await getValidatedQueryOrThrow(event, zNightQuery)

  // A charge the night's closed till left, and the sales recorded late (question 15).
  const [expected, current, history, charges, late, closed, tillsOpen] = await Promise.all([
    nightExpected(night),
    currentReading(night),
    readingHistory(night),
    lateCharges(night),
    lateAdditions(night),
    isDayLocked(night),
    openTills(night),
  ])

  return { ok: true, night, expected, current, history, charges, late, closed, openTills: tillsOpen }
})
