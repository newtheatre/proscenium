// K8 Competencies: each with the courses its routes name, how many routes and how many hold it now.
import { getQuery } from 'h3'
import { defineRoute, readListQuery } from '#kit'
import { competencyRows } from '../../../console-competencies'
import source from '../../../lists/competencies'

export default defineRoute({ ability: 'training.competency.manage', rateLimit: 'default' }, async (event) => {
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const q = (Array.isArray(query.q) ? query.q[0] : query.q) ?? ''
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { rows, total } = await competencyRows(read, q)
  return { rows, total, dropped: read.dropped }
})
