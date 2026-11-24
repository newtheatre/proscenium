// Bookers: the accounts that booked valid tickets, counted once each. A number, never who.
import { sql } from 'drizzle-orm'
import { defineMeasure } from '#kit'
import { ABILITY, countTickets, TICKET_FILTERS, TICKET_KEYS } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.bookers',
  unit: 'count',
  combine: 'distinct',
  by: TICKET_KEYS,
  filters: TICKET_FILTERS,
  ability: ABILITY,
  read: query => countTickets(query, { where: sql`o.state = 'confirmed'`, count: sql`count(DISTINCT o.account_id)` }),
})
