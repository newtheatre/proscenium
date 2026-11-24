// A trainer's own page (M7): the courses they train, sessions to mark and to come, and people part-way.
import { defineRoute } from '#kit'
import { myTeaching } from '../../../teaching'

export default defineRoute({
  ability: 'training.teaching.view',
  rateLimit: 'default',
}, async (_event, { actor }) => myTeaching(actor))
