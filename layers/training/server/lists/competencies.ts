// K8's binding. Search is by title, applied by the route, since titles are few and short.
import { defineListSource } from '#kit'
import { competencies } from '../db/schema'
import { competenciesList } from '../../shared/lists'

export default defineListSource(competenciesList, {
  table: competencies,
  filters: {
    status: { column: 'status' },
  },
  sorts: {
    title: { columns: ['title'], bounded: 10_000 }, // not-policy: the deepest a list pages
  },
  search: { title: false, courses: false, holders: false, status: false },
})
