// PM-S1: the scenarios open to me through my training courses (every one for an administrator),
// my active session if any, and why my last one ended. Read from the real database.
import { defineRoute } from '#kit'
import { practiceList } from '../../../practice/service'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', practice: 'outside' }, async (_event, { actor }) => practiceList(actor))
