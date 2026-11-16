// A list of sales the fixture searches by buyer and note: personal and free text in an append-only
// table, so an erasure must reach the index.
import { defineListSource } from '#kit'
import { ledger } from '../db/schema'

export default defineListSource({ id: 'seats.sales' }, { table: ledger, search: ['buyerName', 'note'] })
