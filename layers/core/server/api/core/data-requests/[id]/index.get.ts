// One data request for staff (ID-35), with its hand-search checklist.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { checklistOf, requestById } from '../../../../identity/data-requests'

export default defineRoute({
  ability: 'core.data-request.manage',
  record: event => ['core.data-request', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const request = (await requestById(record!.id))!
  return { request: { ...request, holds: request.holds ? JSON.parse(request.holds) : [] }, checklist: await checklistOf(request.id) }
})
