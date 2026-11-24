// Archives a saved report, or brings it back with { archived: false } for the toast's Undo (REP-13).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setArchived } from '../../../../definitions'

export default defineRoute({ ability: 'reports.report.create', rateLimit: 'default', input: z.object({ archived: z.boolean() }) }, async (event, { actor, input, unit }) => {
  await setArchived(unit.view(), actor, getRouterParam(event, 'id')!, input.archived)
  return { ok: true }
})
