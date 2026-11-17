// The fixture's lists: what a person can filter, sort and search by. The server binds them to the
// tables in server/lists.
import { defineList } from '../../../../../layers/core/shared/list'

export const performancesList = defineList('seats.performances', {
  filters: {
    day: { kind: 'dates', label: 'Day', presets: [{ value: 'next30d', label: 'Next 30 days' }] },
    full: { kind: 'yes-no', label: 'Sold out' },
  },
  sorts: {
    title: { label: 'Title', type: 'text' },
    day: { label: 'Day', type: 'date', natural: 'desc' },
  },
  columns: {
    title: { label: 'Performance', sort: 'title', always: true },
    day: { label: 'Day', sort: 'day' },
    capacity: { label: 'Capacity' },
  },
  defaultSort: { key: 'title', order: 'asc' },
})

export const salesList = defineList('seats.sales', {
  filters: {
    performance: { kind: 'lookup', label: 'Performance', lookup: { search: '/api/seats/performances', resolve: '/api/seats/performances' } },
    sizes: { kind: 'choices', label: 'Size', options: [{ value: 'single', label: 'One ticket' }, { value: 'group', label: 'Several' }] },
    buyer: { kind: 'lookup', label: 'Buyer', ability: 'seats.orders.sell', lookup: { search: '/api/core/accounts', resolve: '/api/core/accounts' } },
  },
  sorts: {
    at: { label: 'Sold', type: 'date', natural: 'desc' },
  },
  columns: {
    buyerName: { label: 'Buyer', always: true },
    quantity: { label: 'Tickets' },
    note: { label: 'Note', hidden: true },
  },
  defaultSort: { key: 'at', order: 'desc' },
})
