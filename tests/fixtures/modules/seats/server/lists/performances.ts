import { sql } from 'drizzle-orm'
import { defineListSource } from '#kit'
import { performances } from '../db/schema'
import { performancesList } from '../../shared/lists'

export default defineListSource(performancesList, {
  table: performances,
  filters: {
    day: { column: 'operatingDay' },
    full: { where: (full: boolean) => full ? sql`${performances.sold} >= ${performances.capacity}` : sql`${performances.sold} < ${performances.capacity}` },
  },
  sorts: {
    title: { columns: ['title'], bounded: 1000 },
    day: { columns: ['operatingDay'], bounded: 1000 },
  },
  search: { title: 'title', day: false, capacity: false },
})
