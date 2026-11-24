// Admitted: valid tickets scanned in at the door.
import { sql } from 'drizzle-orm'
import { defineMeasure } from '#kit'
import { ABILITY, countTickets, TICKET_FILTERS, TICKET_KEYS } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.admitted',
  unit: 'count',
  combine: 'sum',
  by: TICKET_KEYS,
  filters: TICKET_FILTERS,
  ability: ABILITY,
  read: query => countTickets(query, { where: sql`t.admitted_at IS NOT NULL` }),
})
