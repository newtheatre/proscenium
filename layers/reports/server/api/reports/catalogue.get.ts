// Every figure the reader may read, for the builder's picker and the Figures catalogue (REP-17),
// with the names of the module keys they break down or narrow by.
import { defineRoute } from '#kit'
import { listMeasures } from '#modules/core'
import { keyLabels } from '../../keys'

export default defineRoute({ ability: 'reports.report.view', rateLimit: 'default' }, async (_event, { actor }) => {
  const figures = (await listMeasures(actor)).map(({ ability: _ability, ...m }) => m)
  return { figures, keys: await keyLabels([...new Set(figures.flatMap(f => [...f.by, ...f.filters]))]) }
})
