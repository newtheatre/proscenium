// The ticket types, for setting prices.
import { defineRoute } from '#kit'
import { listTicketTypes } from '../../../setup'

export default defineRoute({ ability: 'box-office.pricing.manage', rateLimit: 'default' }, async () => ({ ticketTypes: await listTicketTypes() }))
