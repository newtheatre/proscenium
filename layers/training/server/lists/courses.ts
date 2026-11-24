// K1's binding. Search is by title, applied by the route, since titles are few and short.
import { defineListSource } from '#kit'
import { courses } from '../db/schema'
import { coursesList } from '../../shared/lists'

export default defineListSource(coursesList, {
  table: courses,
  filters: {
    status: { column: 'status' },
  },
  sorts: {
    title: { columns: ['title'], bounded: 10_000 }, // not-policy: the deepest a list pages
  },
  search: { title: false, status: false, version: false, current: false, lapsing: false },
})
