// The door list's binding: orders, narrowed by the route to those with valid tickets for the one
// performance. Whether everyone has arrived is a condition on those tickets, so the route supplies
// the performance and this binding only says how "every ticket used" reads.
import { sql } from 'drizzle-orm'
import { defineListSource } from '#kit'
import { orders } from '../db/schema'
import { doorList } from '../../shared/lists'

/** The order's valid tickets for a performance that have not yet been used. */
export const unusedTickets = (performanceId: string) => sql`(SELECT count(*) FROM box_office_tickets k JOIN box_office_order_lines l ON l.id = k.order_line_id
  WHERE l.order_id = box_office_orders.id AND k.performance_id = ${performanceId} AND k.state = 'valid' AND k.admitted_at IS NULL)`

export default defineListSource(doorList, {
  table: orders,
  filters: {
    // Applied by the route, which knows the performance.
    arrived: { where: () => sql`1` },
  },
  sorts: {
    reference: { columns: ['reference'], index: 'box_office_orders_reference' },
  },
  search: { buyer: false, reference: false, tickets: false, admitted: false },
})
