// Removes what a run that stopped part way made (C-04): its drafts are deleted and its scheduled
// performances cancelled, so the ability is the one that cancels.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { removeRun } from '../../../../../../programme/runs'

export default defineRoute({
  ability: 'core.performance.cancel',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => removeRun(unit, record!.id, getRouterParam(event, 'run')!))
