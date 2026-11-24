// P2 A campaign's public page: open or closed, with its progress and names where it shows them.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { publicCampaign } from '../../../support'

export default defineRoute({ public: true, rateLimit: 'default' }, async event => ({ campaign: await publicCampaign(getRouterParam(event, 'slug')!) }))
