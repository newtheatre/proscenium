// K3's binding. "When" reads the clock as the filter is applied; search is by title, applied by the route.
import { sql } from 'drizzle-orm'
import { defineListSource, nowMs } from '#kit'
import { sessions } from '../db/schema'
import { sessionsList } from '../../shared/lists'

const WHEN: Record<string, () => ReturnType<typeof sql>> = {
  upcoming: () => sql`(${sessions.endsAt} > ${nowMs()} AND ${sessions.status} IN ('unpublished', 'published'))`,
  unmarked: () => sql`(${sessions.endsAt} <= ${nowMs()} AND ${sessions.status} = 'published')`,
  past: () => sql`(${sessions.endsAt} <= ${nowMs()} AND ${sessions.status} IN ('published', 'completed'))`,
}

export default defineListSource(sessionsList, {
  table: sessions,
  filters: {
    course: { column: 'courseId' },
    when: { where: (value: string) => WHEN[value]!() },
    status: { column: 'status' },
  },
  sorts: {
    starts: { columns: ['startsAt'], bounded: 10_000 }, // not-policy: the deepest a list pages
  },
  search: { starts: false, course: false, space: false, places: false, waiting: false, status: false },
})
