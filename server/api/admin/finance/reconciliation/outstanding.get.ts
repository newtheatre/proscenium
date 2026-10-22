// Nights with takings and no recorded Z reading, and nights whose live reading still disagrees
// with the ledger or replaced another bar's, never truncated (I-104 criterion 5).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')

  const [missing, openVariance, replaced] = await Promise.all([
    nightsMissingAReading(),
    nightsWithOpenVariance(),
    nightsWithReplacedReading(),
  ])

  return { ok: true, missing, openVariance, replaced }
})
