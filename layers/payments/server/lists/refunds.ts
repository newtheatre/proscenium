// Refunds: the list's binding. Search is by who asked, through findAccounts, applied by the route.
import { defineListSource } from '#kit'
import { refunds } from '../db/schema'
import { refundsList } from '../../shared/lists'

export default defineListSource(refundsList, {
  table: refunds,
  filters: {
    state: { column: 'state' },
  },
  sorts: {
    requested: { columns: ['createdAt'], index: 'payments_refunds_created' },
  },
  search: { amount: false, method: false, owner: false, requested: false, state: false },
})
