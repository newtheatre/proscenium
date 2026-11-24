// Tickets issued: every valid ticket, sold or complimentary.
import { defineMeasure } from '#kit'
import { ABILITY, countTickets, TICKET_FILTERS, TICKET_KEYS } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.tickets-issued',
  unit: 'count',
  combine: 'sum',
  by: TICKET_KEYS,
  filters: TICKET_FILTERS,
  ability: ABILITY,
  read: query => countTickets(query),
})
