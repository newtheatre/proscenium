// Find a time (S7, F1 to F5): a read, sent as a body because a find names groups, people and rooms.
import { defineRoute } from '#kit'
import { findTime } from '../../../find'
import { findInput } from '../../../inputs'

export default defineRoute({ ability: 'availability.find.use', rateLimit: 'default', input: findInput }, async (_event, { actor, input }) =>
  await findTime(actor, input))
