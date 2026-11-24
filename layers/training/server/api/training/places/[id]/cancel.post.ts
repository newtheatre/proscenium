// Cancels a place: one's own in time (P3, TR-11), or anyone's with training.place.manage.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { can, defineRoute, first, refuse } from '#kit'
import { samePerson } from '../../../../progress'
import { cancelPlace } from '../../../../sessions'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { actor, unit }) => {
  const id = getRouterParam(event, 'id')!
  const place = await first<{ accountId: string, sessionId: string }>('SELECT account_id AS accountId, session_id AS sessionId FROM training_session_places WHERE id = ?', id)
  if (!place) refuse('training.place.not-found', 'There is no such place.', { status: 404 })
  const own = await samePerson(actor.accountId, place.accountId)
  if (!own && !(await can(actor, 'training.place.manage', ['training.session', place.sessionId])).allowed) refuse('training.place.not-found', 'There is no such place.', { status: 404 })
  await cancelPlace(unit.view(), actor, id, own ? 'self' : 'staff')
  return { placeId: id }
})
