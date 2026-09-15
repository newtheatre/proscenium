import { filterQuerySchema } from '#shared/utils/list-filters'
import { rotaOpeningsList } from '#shared/utils/rota-openings-list'
import type { BarOpeningRow, BarOpeningShiftRow } from '#server/utils/bar-openings'

const query = filterQuerySchema(rotaOpeningsList)

// The planned bar openings and the slots on them: what `/rota/manage/openings` lists, and where
// a member finds an opening slot to claim (E-130 criteria 1 and 4).
export default defineEventHandler(async (event) => {
  // Any member reads the openings to find a slot to claim; who holds one is the officer's view,
  // so it is the permission rather than the route that decides (E-103).
  const resolved = await authority(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const clause = openingsClause(input)
  const offset = offsetFor(input.page, input.pageSize)
  const [items, slots, [totalRow]] = await Promise.all([
    db.all<BarOpeningRow>(openingsQuery(clause, input.pageSize, offset)),
    db.all<BarOpeningShiftRow>(openingShiftsQuery(clause, input.pageSize, offset, resolved.permissions.has('rota.write'))),
    db.all<{ total: number }>(countOpeningsQuery(clause)),
  ])

  return { ...envelope(items, totalRow?.total ?? 0, input.page, input.pageSize), slots }
})
