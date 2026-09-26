// What a show night needs set up, for the rota's owner: the gating module each role names, what
// each venue we run still lacks, and the board's calls (issue 1318). Read-only, so no audit row.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.read')

  const [eligibility, venues, board] = await Promise.all([
    roleEligibilities(event),
    venueReadiness(),
    boardReadiness(),
  ])

  return { eligibility, venues, board }
})
