// A plan's entries, accepted first; `inTray` marks those with fewer placements than they want (W9).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { entriesOf } from '../../../../plans'

export default defineRoute({
  ability: 'programme-planning.entry.view',
  record: event => ['programme-planning.plan', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => ({ entries: await entriesOf(record!.id) }))
