// Takes a place: one's own with training.place.book, or another person's with training.place.manage alone (P1, TR-10, TR-12).
import { getRouterParam } from 'h3'
import { defineRoute, requireAbility } from '#kit'
import { placeInput } from '../../../../inputs'
import { bookPlace } from '../../../../sessions'

export default defineRoute({
  ability: 'signed-in',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: placeInput,
}, async (_event, { record, input, actor, unit }) => {
  const other = !!input.accountId && input.accountId !== actor.accountId
  await requireAbility(actor, other ? 'training.place.manage' : 'training.place.book', record)
  return bookPlace(unit.view(), actor, { sessionId: record!.id, accountId: input.accountId ?? actor.accountId!, by: other ? 'staff' : 'self' })
})
