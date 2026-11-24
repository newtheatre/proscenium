// What K3's and K2's "New session" offers: live courses, the theatre's own spaces and the usual capacity,
// and whether the reader may make one. Whoever only gives places sees the list without "New session".
import { can, defineRoute, refuse } from '#kit'
import { sessionOptions } from '../../../console-sessions'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const create = (await can(actor, 'training.session.manage')).allowed
  if (!create && !(await can(actor, 'training.place.manage')).allowed) refuse('core.forbidden', 'You cannot see training sessions.', { status: 403 })
  return { ...await sessionOptions(), create }
})
