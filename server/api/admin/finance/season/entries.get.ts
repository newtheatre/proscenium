import { filterQuerySchema } from '#shared/utils/list-filters'
import { ledgerEntriesList } from '#shared/utils/ledger-entries-list'

const query = filterQuerySchema(ledgerEntriesList)

// Every figure on the dashboard drills down to its ledger entries (I-105 criterion 3), filtered
// by its own declaration (K-129), paged in SQL and never a bare array. Treasurer and administrators only.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = ledgerEntriesClause(input)

  const { items, total } = await ledgerEntries(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
