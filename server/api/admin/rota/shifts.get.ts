import { filterQuerySchema } from '#shared/utils/list-filters'
import { unfilledShiftsList } from '#shared/utils/unfilled-shifts-list'
import type { UnfilledShiftRow } from '#server/utils/rota'

const query = filterQuerySchema(unfilledShiftsList)

// Every open or declined shift on a performance that has not yet run, filtered by its
// declaration (E-107 criterion 3, K-129, `docs/known-issues.md`).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const input = await getValidatedQueryOrThrow(event, query)

  const now = Math.floor(Date.now() / 1000)
  const clause = unfilledShiftsClause(input, now)
  const [items, [totalRow]] = await Promise.all([
    db.all<UnfilledShiftRow>(unfilledShiftsQuery(clause, input.pageSize, offsetFor(input.page, input.pageSize))),
    db.all<{ total: number }>(countUnfilledShiftsQuery(clause)),
  ])

  return envelope(items, totalRow?.total ?? 0, input.page, input.pageSize)
})
