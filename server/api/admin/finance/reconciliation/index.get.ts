import { z } from 'zod'

const query = z.object({ night: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A night is YYYY-MM-DD') })

// The night's expected SumUp Z, itemised, and every reading recorded against it, current first
// (I-104 criteria 1, 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const { night } = await getValidatedQueryOrThrow(event, query)

  const [expected, current, history] = await Promise.all([
    nightExpected(night),
    currentReading(night),
    readingHistory(night),
  ])

  return { ok: true, night, expected, current, history }
})
