// Orders: the staff list's binding. Baskets are never listed: the route leaves them out, since a
// basket belongs to a browser and not yet to anyone the theatre serves. Search is by booking
// reference or by the buyer through findAccounts, both applied by the route.
import { sql } from 'drizzle-orm'
import { defineListSource } from '#kit'
import { orders } from '../db/schema'
import { ordersList } from '../../shared/lists'

export default defineListSource(ordersList, {
  table: orders,
  filters: {
    state: { column: 'state' },
    channel: { column: 'channel' },
    // An order is a show's or a performance's when any of its lines is for it, so a pass sold on its own is in neither.
    show: { where: (id: string) => sql`${orders.id} IN (SELECT l.order_id FROM box_office_order_lines l JOIN core_performances f ON f.id = l.performance_id WHERE f.production_id = ${id})` },
    performance: { where: (id: string) => sql`${orders.id} IN (SELECT order_id FROM box_office_order_lines WHERE performance_id = ${id})` },
  },
  sorts: {
    created: { columns: ['createdAt'], index: 'box_office_orders_created' },
  },
  search: { reference: false, buyer: false, show: false, state: false, total: false, created: false },
})
