// S9 Invoice series: every series, the archived after the rest.
import { defineRoute } from '#kit'
import { listSeries } from '../../../series'

export default defineRoute({ ability: 'invoicing.settings.manage', rateLimit: 'default' }, async () => ({ series: await listSeries() }))
