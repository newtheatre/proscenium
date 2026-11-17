// Payments' lists (Box office specification, part 5): what a person can filter, sort and search by.
// The sources in server/lists bind each key to the table; search finds the person through
// findAccounts, applied by each route.
import { defineList } from '#kit/list-declaration'

/** Refunds, newest first: found by who asked for them. */
export const refundsList = defineList('payments.refunds', {
  filters: {
    state: {
      kind: 'choices',
      label: 'State',
      options: [
        { value: 'requested', label: 'Waiting for approval' },
        { value: 'approved', label: 'Approved' },
        { value: 'sent', label: 'Sent' },
        { value: 'succeeded', label: 'Refunded' },
        { value: 'failed', label: 'Failed' },
        { value: 'declined', label: 'Declined' },
      ],
    },
  },
  sorts: {
    requested: { label: 'Asked', type: 'date', natural: 'desc' },
  },
  columns: {
    amount: { label: 'Amount', always: true, card: true },
    method: { label: 'Paid by', card: true },
    owner: { label: 'For' },
    requested: { label: 'Asked', sort: 'requested', card: true },
    state: { label: 'State', card: true },
  },
  views: {
    'waiting': { label: 'Waiting for approval', filters: { state: 'requested' } },
    'on-the-way': { label: 'On the way', filters: { state: 'approved,sent' } },
    'failed': { label: 'Failed', filters: { state: 'failed' } },
    'all': { label: 'All' },
  },
  defaultView: 'waiting',
  defaultSort: { key: 'requested', order: 'desc' },
})

/** Till sessions, newest first: found by who opened them. */
export const sessionsList = defineList('payments.sessions', {
  filters: {
    state: {
      kind: 'choices',
      label: 'State',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'counting', label: 'Being counted' },
        { value: 'closed', label: 'Closed' },
      ],
    },
    opened: { kind: 'dates', label: 'Opened', presets: [{ value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }] },
  },
  sorts: {
    opened: { label: 'Opened', type: 'date', natural: 'desc' },
  },
  columns: {
    till: { label: 'Till', always: true, card: true },
    person: { label: 'Opened by', card: true },
    opened: { label: 'Opened', sort: 'opened', card: true },
    state: { label: 'State', card: true },
    expected: { label: 'Expected cash' },
    counted: { label: 'Counted' },
    difference: { label: 'Difference', card: true },
  },
  views: {
    all: { label: 'All' },
    counting: { label: 'Being counted', filters: { state: 'counting' } },
  },
  defaultView: 'all',
  defaultSort: { key: 'opened', order: 'desc' },
})
