// Data requests: the staff list's binding (ID-35). Overdue means still open after its respond-by
// date, so it reads the clock when the filter is applied.
import { sql } from 'drizzle-orm'
import { defineListSource, nowMs } from '#kit'
import { dataRequests } from '../db/identity'
import { dataRequestsList } from '../../shared/identity-lists'

export default defineListSource(dataRequestsList, {
  table: dataRequests,
  filters: {
    kind: { column: 'kind' },
    state: { column: 'state' },
    closed: { where: (yes: boolean) => yes ? sql`${dataRequests.closedAt} IS NOT NULL` : sql`${dataRequests.closedAt} IS NULL` },
    overdue: {
      where: (yes: boolean) => yes
        ? sql`(${dataRequests.closedAt} IS NULL AND ${dataRequests.respondBy} < ${nowMs()})`
        : sql`(${dataRequests.closedAt} IS NOT NULL OR ${dataRequests.respondBy} >= ${nowMs()})`,
    },
  },
  sorts: {
    respondBy: { columns: ['respondBy'], index: 'core_data_requests_respond_by' },
  },
  search: { person: false, kind: false, state: false, requestedAt: false, respondBy: false },
})
