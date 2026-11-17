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

/** Who is coming to one performance: one row for each order holding tickets for it. */
export const doorList = defineList('box-office.door-list', {
  filters: {
    arrived: { kind: 'yes-no', label: 'Every ticket used' },
  },
  sorts: {
    reference: { label: 'Reference', type: 'text', natural: 'asc' },
  },
  columns: {
    buyer: { label: 'Name', always: true, card: true },
    reference: { label: 'Reference', sort: 'reference', card: true },
    tickets: { label: 'Tickets', card: true },
    admitted: { label: 'In', card: true },
  },
  views: {
    waiting: { label: 'Still to arrive', filters: { arrived: 'no' } },
    all: { label: 'Everyone' },
  },
  defaultView: 'waiting',
  defaultSort: { key: 'reference', order: 'asc' },
})
