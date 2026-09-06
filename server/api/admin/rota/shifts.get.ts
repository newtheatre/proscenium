import type { UnfilledShiftRow } from '#server/utils/rota'

// Every open or declined shift on a performance that has not yet run: what an officer has to
// fill by hand (E-107 criterion 3, `docs/known-issues.md`).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)

  const now = Math.floor(Date.now() / 1000)
  const [items, [totalRow]] = await Promise.all([
    db.all<UnfilledShiftRow>(unfilledShiftsQuery(now, pageSize, offsetFor(page, pageSize))),
    db.all<{ total: number }>(countUnfilledShiftsQuery(now)),
  ])

  return envelope(items, totalRow?.total ?? 0, page, pageSize)
})
