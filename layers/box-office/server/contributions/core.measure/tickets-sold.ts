// Tickets sold: valid tickets that are not complimentary, whatever they cost.
import { sql } from 'drizzle-orm'
import { defineMeasure } from '#kit'
import { ABILITY, countTickets, TICKET_FILTERS, TICKET_KEYS } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.tickets-sold',
  unit: 'count',
  combine: 'sum',
  by: TICKET_KEYS,
  filters: TICKET_FILTERS,
  ability: ABILITY,
  read: query => countTickets(query, { where: sql`ty.kind <> 'complimentary'` }),
})
