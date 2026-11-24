// Complimentary tickets: valid tickets on a complimentary ticket type.
import { defineMeasure } from '#kit'
import { ABILITY, COMPLIMENTARY, countTickets, TICKET_FILTERS, TICKET_KEYS } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.tickets-comp',
  unit: 'count',
  combine: 'sum',
  by: TICKET_KEYS,
  filters: TICKET_FILTERS,
  ability: ABILITY,
  read: query => countTickets(query, { where: COMPLIMENTARY, uses: ['line'] }),
})
