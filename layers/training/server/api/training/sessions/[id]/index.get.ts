// One session: its details, the reader's own place and the times that decide what they may do, and for those who run or manage it, every place.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { getCourse } from '../../../../courses'
import { sessionTimes } from '../../../../learner'
import { placeFor, placesOf, sessionOrRefuse, sessionTrainers } from '../../../../sessions'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const session = await sessionOrRefuse(record!.id)
  const manages = (await can(actor, 'training.session.manage', record)).allowed
  const runs = (await can(actor, 'training.session.run', record)).allowed
  const placesManaged = (await can(actor, 'training.place.manage', record)).allowed
  if (session.status === 'unpublished' && !manages) refuse('training.session.not-found', 'There is no such session.', { status: 404 })
  return {
    session,
    courseSlug: (await getCourse(session.courseId))?.slug ?? null,
    trainers: await sessionTrainers(session),
    mine: actor.accountId ? await placeFor(session.id, actor.accountId) : null,
    times: await sessionTimes(session, actor.accountId),
    places: runs || manages || placesManaged ? await placesOf(session.id) : null,
    actions: { manage: manages, run: runs, places: placesManaged, book: (await can(actor, 'training.place.book')).allowed },
  }
})
