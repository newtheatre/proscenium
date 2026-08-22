import { manageBar } from '~~/shared/utils/abilities'

/** GET /api/admin/bar/tabs, who owes what, biggest first. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const query = await getValidatedQuery(event, paginationSchema.parse)
  const { rows, total } = await outstandingByPerson(query.limit, offsetFor(query))

  return paginated(
    rows.map(row => ({ ...row, overSoftCap: row.outstandingPence > TAB_SOFT_CAP_PENCE })),
    total,
    query,
  )
})
