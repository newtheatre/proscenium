// Close a data request (ID-35): only once it has run and every checklist line is ticked.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { closeRequest, requestById } from '../../../../identity/data-requests'

export default defineRoute({
  ability: 'core.data-request.manage',
  record: event => ['core.data-request', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { record, unit, actor }) => {
  await closeRequest(unit, actor, (await requestById(record!.id))!)
  return { ok: true }
})
