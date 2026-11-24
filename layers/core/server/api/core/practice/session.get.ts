// PM-S4: the practice panel, read inside the person's store: tasks, things to run, the outbox and a
// payment waiting on the practice card reader.
import { defineRoute } from '#kit'
import { panel } from '../../../practice/service'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async () => panel())
