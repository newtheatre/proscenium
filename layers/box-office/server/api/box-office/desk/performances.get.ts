// The performances the desk can sell for now, each with what is free and what it costs, and the
// email providers the buyer box suggests after a typed name.
import { defineRoute, useSetting } from '#kit'
import { deskPerformances } from '../../../desk'

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async () => ({
  performances: await deskPerformances(),
  emailDomains: await useSetting('box-office.till.email-domains'),
}))
