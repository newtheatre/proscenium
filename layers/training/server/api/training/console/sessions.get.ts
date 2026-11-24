// K3 Sessions: every session with its course, places taken of capacity, those waiting and its state.
import { getQuery } from 'h3'
import { can, defineRoute, readListQuery, refuse } from '#kit'
import { sessionRows } from '../../../console-sessions'
import source from '../../../lists/sessions'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  if (!(await can(actor, 'training.session.manage')).allowed && !(await can(actor, 'training.place.manage')).allowed)
    refuse('core.forbidden', 'You cannot see training sessions.', { status: 403 })
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const q = (Array.isArray(query.q) ? query.q[0] : query.q) ?? ''
  const read = await readListQuery({ ...query, q: undefined }, source)
  const { rows, total } = await sessionRows(read, q)
  return { rows, total, dropped: read.dropped }
})
