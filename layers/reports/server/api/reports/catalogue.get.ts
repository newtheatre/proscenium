// Every figure the reader may read, for the builder's picker and the Figures catalogue (REP-17).
import { defineRoute } from '#kit'
import { listMeasures } from '#modules/core'

export default defineRoute({ ability: 'reports.report.view', rateLimit: 'default' }, async (_event, { actor }) => ({
  figures: (await listMeasures(actor)).map(({ ability: _ability, ...m }) => m),
}))
