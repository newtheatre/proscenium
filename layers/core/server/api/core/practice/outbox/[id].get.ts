// PM-S8: one would-be email from the practice outbox, as the theatre's real email would read.
import { defineRoute } from '#kit'
import { outboxEmail } from '../../../../practice/service'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async event => outboxEmail(event.context.params!.id!))
