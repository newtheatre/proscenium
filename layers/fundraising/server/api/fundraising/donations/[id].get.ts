// C3 Donation: one gift, its donor, fund and payment.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getDonation } from '../../../donations'

export default defineRoute({ ability: 'fundraising.donation.view', record: event => ['fundraising.donation', getRouterParam(event, 'id')], rateLimit: 'default' }, async event => ({ donation: await getDonation(getRouterParam(event, 'id')!) }))
