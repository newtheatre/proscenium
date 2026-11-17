// The ledger: the list's binding. Account and production are conditions on the posting's entries;
// search is applied by the route, since it reads the accounts and the source reference.
import { sql } from 'drizzle-orm'
import { defineListSource } from '#kit'
import { postings } from '../db/schema'
import { ledgerList } from '../../shared/lists'

export default defineListSource(ledgerList, {
  table: postings,
  filters: {
    account: { where: (id: string) => sql`EXISTS (SELECT 1 FROM finance_entries x WHERE x.posting_id = ${postings.id} AND x.account_id = ${id})` },
    period: { column: 'periodId' },
    production: { where: (id: string) => sql`EXISTS (SELECT 1 FROM finance_entries x WHERE x.posting_id = ${postings.id} AND x.production_id = ${id})` },
    kind: { column: 'kind' },
    occurred: { column: 'occurredAt' },
  },
  sorts: {
    occurred: { columns: ['occurredAt'], index: 'finance_postings_occurred' },
  },
  search: { kind: false, occurred: false, source: false, amount: false },
})
