// The choices what's on can be narrowed by (C-38): the categories, seasons, venues and months that
// something on now has, so no filter ever leads to an empty page.
import { defineRoute } from '#kit'
import { whatsOnFilters } from '#modules/core'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => whatsOnFilters())
