// Orders: the staff list's binding. Baskets are never listed: the route leaves them out, since a
// basket belongs to a browser and not yet to anyone the theatre serves. Search is by booking
// reference or by the buyer through findAccounts, both applied by the route.
import { defineListSource } from '#kit'
import { orders } from '../db/schema'
import { ordersList } from '../../shared/lists'

export default defineListSource(ordersList, {
  table: orders,
  filters: {
    state: { column: 'state' },
    channel: { column: 'channel' },
  },
  sorts: {
    created: { columns: ['createdAt'], index: 'box_office_orders_created' },
  },
  search: { reference: false, buyer: false, show: false, state: false, total: false, created: false },
})
