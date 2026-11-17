// Box office's lists (Box office specification, part 6, "Screens"): what a person can filter, sort
// and search by. The sources in server/lists bind each key to the table.
import { defineList } from '#kit/list-declaration'

/** Orders, newest first: found by booking reference or the buyer's name or address. */
export const ordersList = defineList('box-office.orders', {
  filters: {
    state: {
      kind: 'choices',
      label: 'State',
      options: [
        { value: 'reserved', label: 'Reserved' },
        { value: 'awaiting_payment', label: 'Awaiting payment' },
        { value: 'confirmed', label: 'Paid' },
        { value: 'cancelled', label: 'Cancelled' },
        { value: 'expired', label: 'Lapsed' },
      ],
    },
    channel: {
      kind: 'choices',
      label: 'Sold',
      options: [
        { value: 'online', label: 'Online' },
        { value: 'desk', label: 'At the desk' },
        { value: 'phone', label: 'By phone' },
      ],
    },
  },
  sorts: {
    created: { label: 'Made', type: 'date', natural: 'desc' },
  },
  columns: {
    reference: { label: 'Reference', always: true, card: true },
    buyer: { label: 'Buyer', card: true },
    show: { label: 'Performance', card: true },
    state: { label: 'State', card: true },
    total: { label: 'Total' },
    created: { label: 'Made', sort: 'created' },
  },
  views: {
    live: { label: 'Reserved and paid', filters: { state: 'reserved,awaiting_payment,confirmed' } },
    reserved: { label: 'Reserved', filters: { state: 'reserved' } },
    all: { label: 'All' },
  },
  defaultView: 'live',
  defaultSort: { key: 'created', order: 'desc' },
})
