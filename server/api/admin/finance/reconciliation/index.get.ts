import { zNightQuery } from '#shared/utils/night-reconciliation'

// The night's expected SumUp Z, itemised, and every reading recorded against it, current first
// (I-104 criteria 1, 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const { night } = await getValidatedQueryOrThrow(event, zNightQuery)

  const [expected, current, history] = await Promise.all([
    nightExpected(night),
    currentReading(night),
    readingHistory(night),
  ])

  return { ok: true, night, expected, current, history }
})
