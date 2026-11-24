// K1 Courses: every course with its state, live version, holders and those lapsing soon.
import { getQuery } from 'h3'
import { defineRoute, readListQuery } from '#kit'
import { courseRows } from '../../../console'
import source from '../../../lists/courses'

export default defineRoute({ ability: 'training.course.manage', rateLimit: 'default' }, async (event) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const q = (Array.isArray(query.q) ? query.q[0] : query.q) ?? ''
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { rows, total } = await courseRows(read, q)
  return { rows, total, dropped: read.dropped }
})
