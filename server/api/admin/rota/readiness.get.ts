// What a show night needs set up, for the rota's owner: the gating module each role names, who
// holds it, what each venue still lacks and the board's calls (issue 1318, 0210). No audit row.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.read')

  const [eligibility, venues, board] = await Promise.all([
    roleEligibilities(event),
    venueReadiness(),
    boardReadiness(),
  ])

  const qualified = await qualifiedCounts(eligibility)

  return { eligibility, qualified, venues, board }
})
