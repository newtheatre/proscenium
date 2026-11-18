// Undo for a run just added (C-04): its performances are removed again, drafts and scheduled alike,
// within a few minutes of adding them. A module that would refuse a cancel refuses this too.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { undoAdded } from '../../../../../programme/runs'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ ids: z.array(z.string().min(1)).min(1).max(5000) }), // not-policy: a run's own ceiling
}, async (_event, { unit, record, input, actor }) => undoAdded(unit, record!.id, input.ids, actor))
