// A list of sales the fixture searches by buyer and note: personal and free text in an append-only
// table, so an erasure must reach the index. The buyer's name is searched only by someone who may
// sell tickets.
import { sql } from 'drizzle-orm'
import { defineListSource } from '#kit'
import { ledger } from '../db/schema'
import { salesList } from '../../shared/lists'

export default defineListSource(salesList, {
  table: ledger,
  filters: {
    performance: { column: 'performanceId' },
    sizes: { where: (sizes: string[]) => sql`(CASE WHEN ${ledger.quantity} > 1 THEN 'group' ELSE 'single' END) IN (SELECT value FROM json_each(${JSON.stringify(sizes)}))` },
    buyer: { column: 'buyer' },
  },
  sorts: {
    at: { columns: ['at'], bounded: 1000 },
  },
  search: { buyerName: { column: 'buyerName', ability: 'seats.orders.sell' }, quantity: false, note: 'note' },
})
