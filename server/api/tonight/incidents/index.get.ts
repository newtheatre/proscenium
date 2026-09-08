import type { IncidentEntry } from '#server/utils/incidents'

// Tonight's log, superseded entries and all: the chain has to stay visible (E-115 criterion 3).
export default defineEventHandler(async (event) => {
  await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'DOOR', 'BAR'])
  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)

  const { from, to } = showNightBounds(currentShowNight())
  const bounds = [Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)] as const

  const [items, [totalRow]] = await Promise.all([
    db.all<IncidentEntry>(incidentsOnQuery(...bounds, pageSize, offsetFor(page, pageSize))),
    db.all<{ total: number }>(countIncidentsOnQuery(...bounds)),
  ])

  return envelope(items, totalRow?.total ?? 0, page, pageSize)
})
