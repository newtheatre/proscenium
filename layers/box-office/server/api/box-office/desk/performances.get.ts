// The performances the desk can sell for now, each with what is free and what it costs.
import { defineRoute } from '#kit'
import { deskPerformances } from '../../../desk'

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async () => ({ performances: await deskPerformances() }))
