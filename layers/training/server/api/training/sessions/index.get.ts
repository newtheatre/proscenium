// Sessions not yet over: published ones for anyone who may see courses, unpublished too for those who manage sessions.
import { getQuery } from 'h3'
import { can, defineRoute, nowMs } from '#kit'
import { listSessions } from '../../../sessions'

export default defineRoute({
  ability: 'training.course.view',
  rateLimit: 'default',
}, async (event, { actor }) => {
  const courseId = typeof getQuery(event).course === 'string' ? getQuery(event).course as string : undefined
  const manages = (await can(actor, 'training.session.manage', courseId ? ['training.course', courseId] : undefined)).allowed
  return { sessions: await listSessions({ courseId, from: nowMs(), unpublished: manages }) }
})
