// C2 Donations: received gifts newest first, or those in one state, searched and filtered.
import { defineRoute } from '#kit'
import { donationQuery, listDonations } from '../../../donations'

export default defineRoute({ ability: 'fundraising.donation.view', rateLimit: 'default', input: donationQuery }, async (_event, { input }) => ({ donations: await listDonations(input) }))
