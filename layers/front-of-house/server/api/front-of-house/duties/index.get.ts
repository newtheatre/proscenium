// The theatre's duties, in their order.
import { defineRoute } from '#kit'
import { listDuties } from '../../../shifts'

export default defineRoute({ ability: 'front-of-house.duty.manage', rateLimit: 'default' }, async () => ({ duties: await listDuties() }))
