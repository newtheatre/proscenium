// Nights with takings and no recorded Z reading, and nights whose live reading still disagrees
// with the ledger, never truncated (I-104 criterion 5).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')

  const [missing, openVariance] = await Promise.all([nightsMissingAReading(), nightsWithOpenVariance()])

  return { ok: true, missing, openVariance }
})
