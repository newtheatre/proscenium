// The venues index (/venues): every active venue audiences go to, by name, with its address and its
// own access features, each linking to the venue's page.
import { defineRoute } from '#kit'
import { publicVenues } from '#modules/core'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => ({ venues: await publicVenues() }))
