// Training's declared lists (training-records part 5, "Console"): what a manager can filter, sort and
// search by. The sources in server/lists bind each key to the table.
import { defineList } from '#kit/list-declaration'
import { COURSE_STATES } from './states'

/** K1: every course with its state, live version, holders and those lapsing soon. */
export const coursesList = defineList('training.courses', {
  filters: {
    status: { kind: 'choices', label: 'State', options: COURSE_STATES.map(value => ({ value, label: value })) },
  },
  sorts: {
    title: { label: 'Title', type: 'text', natural: 'asc' },
  },
  columns: {
    title: { label: 'Title', sort: 'title', always: true },
    status: { label: 'State', card: true },
    version: { label: 'Version', card: true },
    current: { label: 'Holders', card: true },
    lapsing: { label: 'Lapsing soon', card: true },
  },
  views: {
    active: { label: 'In use', filters: { status: 'unpublished,live' } },
    retired: { label: 'Retired', filters: { status: 'retired' } },
    all: { label: 'All' },
  },
  defaultView: 'active',
  defaultSort: { key: 'title', order: 'asc' },
})
