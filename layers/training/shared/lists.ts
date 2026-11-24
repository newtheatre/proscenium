// Training's declared lists (training-records part 5, "Console"): what a manager can filter, sort and
// search by. The sources in server/lists bind each key to the table.
import { defineList } from '#kit/list-declaration'
import { COMPETENCY_STATES, COURSE_STATES, SESSION_STATES } from './states'

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

/** K3: sessions with their course, places taken of capacity, those waiting and their state. Courses are the page's options. */
export const sessionsList = defineList('training.sessions', {
  filters: {
    course: { kind: 'choice', label: 'Course' },
    when: { kind: 'choice', label: 'When', options: [{ value: 'upcoming', label: 'upcoming' }, { value: 'unmarked', label: 'unmarked' }, { value: 'past', label: 'past' }] },
    status: { kind: 'choices', label: 'State', options: SESSION_STATES.map(value => ({ value, label: value })) },
  },
  sorts: {
    starts: { label: 'Starts', type: 'date', natural: 'asc' },
  },
  columns: {
    starts: { label: 'Starts', sort: 'starts', always: true },
    course: { label: 'Course', card: true },
    space: { label: 'Space', card: true },
    places: { label: 'Places', card: true },
    waiting: { label: 'Waiting', card: true },
    status: { label: 'State', card: true },
  },
  views: {
    upcoming: { label: 'Upcoming', filters: { when: 'upcoming' } },
    unmarked: { label: 'Needs marking', filters: { when: 'unmarked' } },
    past: { label: 'Past', filters: { when: 'past' }, sort: 'starts', order: 'desc' },
    cancelled: { label: 'Cancelled', filters: { status: 'cancelled' }, sort: 'starts', order: 'desc' },
    all: { label: 'All', sort: 'starts', order: 'desc' },
  },
  defaultView: 'upcoming',
  defaultSort: { key: 'starts', order: 'asc' },
})

/** K8: competencies with the courses their routes name, how many routes and how many hold each now. */
export const competenciesList = defineList('training.competencies', {
  filters: {
    status: { kind: 'choices', label: 'State', options: COMPETENCY_STATES.map(value => ({ value, label: value })) },
  },
  sorts: {
    title: { label: 'Title', type: 'text', natural: 'asc' },
  },
  columns: {
    title: { label: 'Title', sort: 'title', always: true },
    courses: { label: 'Courses', card: true },
    holders: { label: 'Holders', card: true },
    status: { label: 'State', card: true },
  },
  views: {
    active: { label: 'Active', filters: { status: 'active' } },
    retired: { label: 'Retired', filters: { status: 'retired' } },
    all: { label: 'All' },
  },
  defaultView: 'active',
  defaultSort: { key: 'title', order: 'asc' },
})
