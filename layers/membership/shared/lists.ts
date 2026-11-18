// Membership's lists (Membership specification, tab 5, "Members"): what a person can filter, sort and
// search by. The source in server/lists binds each key to the table.
import { defineList } from '#kit/list-declaration'

/** Members: one row per membership, because the dates and the scheme are what staff act on. */
export const membersList = defineList('membership.members', {
  filters: {
    status: {
      kind: 'choices',
      label: 'Status',
      options: [
        { value: 'current', label: 'Current' },
        { value: 'in-grace', label: 'In grace' },
        { value: 'upcoming', label: 'Starts later' },
        { value: 'lapsed', label: 'Lapsed' },
        { value: 'ended', label: 'Ended' },
      ],
    },
    scheme: { kind: 'lookup', label: 'Scheme', lookup: { search: '/api/membership/schemes/lookup', resolve: '/api/membership/schemes/lookup' } },
  },
  sorts: {
    joined: { label: 'Joined', type: 'date', natural: 'desc' },
  },
  columns: {
    name: { label: 'Name', always: true },
    number: { label: 'No.', card: true },
    scheme: { label: 'Scheme' },
    status: { label: 'Status' },
    until: { label: 'Valid until' },
    joined: { label: 'Joined', sort: 'joined' },
  },
  views: {
    current: { label: 'Current', filters: { status: 'current,in-grace' } },
    lapsed: { label: 'Lapsed', filters: { status: 'lapsed' } },
    ended: { label: 'Ended', filters: { status: 'ended' } },
    all: { label: 'Everyone' },
  },
  defaultView: 'current',
  defaultSort: { key: 'joined', order: 'desc' },
})
