// Cancel somebody's data request before it runs (ID-35).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { cancelRequest, requestById } from '../../../../identity/data-requests'

export default defineRoute({
  ability: 'core.data-request.manage',
  record: event => ['core.data-request', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { record, unit }) => {
  await cancelRequest(unit, (await requestById(record!.id))!, true)
  return { ok: true }
})
